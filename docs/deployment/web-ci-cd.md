# Web CI/CD runbook

Lunumia deploys its two static production surfaces from GitHub Actions using
short-lived AWS credentials. Normal releases must not use permanent AWS access
keys or a developer workstation.

## Release flow

Pull requests run `.github/workflows/ci.yml`. A push to `dev` runs the same
reusable CI gate from `.github/workflows/deploy-web.yml` and then waits on the
protected GitHub Environment named `production` before any AWS credentials are
requested.

The required CI gate installs with the frozen pnpm lockfile, validates migration
filenames, typechecks, lints, runs all Vitest tests, and builds both App and
Landing. It never connects to or mutates the production Supabase project.

Production deployments are serialized by the `lunumia-production-web`
concurrency group. `cancel-in-progress` is disabled so a newer run cannot cancel
a deployment halfway through and race it to S3.

## Path selection

- `src/`, `public/`, the root App entry point, and App Vite/TypeScript config
  deploy App only.
- `landing/` and `tsconfig.landing.json` deploy Landing only.
- package, lockfile, Node, and shared TypeScript changes deploy both.
- CI, documentation, IAM source, scripts, Supabase, Android, tests, and brand
  source changes still run CI but do not publish unchanged web artifacts.
- any unknown tracked path is treated as shared and deploys both. This is the
  deliberate fail-safe against silently missing a production release.

`workflow_dispatch` can intentionally deploy `app`, `landing`, or `both`, but
the deployment job also requires `refs/heads/dev` and the `production`
Environment.

## GitHub Environment gate

Create `production` before pushing the deployment workflow. Configure:

- required reviewer: repository owner `Cesar-ESR`;
- deployment branches: selected branch `dev` only;
- environment URL: `https://app.lunumia.com` (also declared by the workflow);
- variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` using the
  existing client-public production values.

Do not store `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, a Supabase
`service_role` key, `GROQ_API_KEY`, SMTP credentials, or other private secrets
in the Environment. AWS authentication is exclusively OIDC.

This repository is public and was created after GitHub's immutable OIDC subject
rollout. Its exact production subject is:

```text
repo:Cesar-ESR@177269805/Lunumia-Project@1329425457:environment:production
```

The immutable owner/repository IDs are intentional and must not be replaced by
wildcards. The AWS trust policy independently requires `refs/heads/dev`, the
`production` environment, repository ID `1329425457`, and owner ID `177269805`
in addition to the exact subject and audience.

After installing and authenticating GitHub CLI, the following PowerShell creates
the protected Environment, restricts it to `dev`, and stores only the two
client-public Vite values. Load those values into the current process first;
the commands do not print them.

```powershell
$Repo = 'Cesar-ESR/Lunumia-Project'
gh auth status

$EnvironmentBody = @{
  wait_timer = 0
  prevent_self_review = $false
  reviewers = @(
    @{ type = 'User'; id = 177269805 }
  )
  deployment_branch_policy = @{
    protected_branches = $false
    custom_branch_policies = $true
  }
} | ConvertTo-Json -Depth 6 -Compress

$EnvironmentBody | gh api --method PUT `
  -H 'Accept: application/vnd.github+json' `
  -H 'X-GitHub-Api-Version: 2026-03-10' `
  "/repos/$Repo/environments/production" `
  --input - | Out-Null

$Policies = gh api `
  -H 'Accept: application/vnd.github+json' `
  -H 'X-GitHub-Api-Version: 2026-03-10' `
  "/repos/$Repo/environments/production/deployment-branch-policies" |
  ConvertFrom-Json

if ('dev' -notin @($Policies.branch_policies.name)) {
  @{ name = 'dev'; type = 'branch' } |
    ConvertTo-Json -Compress |
    gh api --method POST `
      -H 'Accept: application/vnd.github+json' `
      -H 'X-GitHub-Api-Version: 2026-03-10' `
      "/repos/$Repo/environments/production/deployment-branch-policies" `
      --input - | Out-Null
}

if (-not $env:VITE_SUPABASE_URL) { throw 'Set VITE_SUPABASE_URL in this process.' }
if (-not $env:VITE_SUPABASE_PUBLISHABLE_KEY) { throw 'Set VITE_SUPABASE_PUBLISHABLE_KEY in this process.' }

gh variable set VITE_SUPABASE_URL `
  --repo $Repo --env production --body $env:VITE_SUPABASE_URL
gh variable set VITE_SUPABASE_PUBLISHABLE_KEY `
  --repo $Repo --env production --body $env:VITE_SUPABASE_PUBLISHABLE_KEY
```

Verify in **Settings → Environments → production** that the reviewer and `dev`
branch rule are present before pushing `.github/workflows/deploy-web.yml`.

## AWS OIDC and role

AWS account `953483531248` uses one role named
`lunumia-github-web-deploy`. The trust source is
`infra/aws/github-web-deploy-trust-policy.json`; permissions are in
`infra/aws/github-web-deploy-permissions.json`.

The role can list and manage generated objects only in:

- `lunumia-prod-app-us-east-1-953483531248`;
- `lunumia-prod-landing-us-east-1-953483531248`.

It can create and inspect invalidations only for distributions
`E2UXB5FEASW4B1` and `EFZ0L1GNARUJ0`. It has no IAM, wildcard S3,
wildcard CloudFront, DNS, Supabase, or administrator permission.

From authenticated PowerShell at the repository root, the idempotent setup
sequence is:

```powershell
$AwsProfile = 'lunumia-prod'
$ExpectedAccount = '953483531248'
$Aws = 'C:\Program Files\Amazon\AWSCLIV2\aws.exe'

$Account = & $Aws sts get-caller-identity --profile $AwsProfile --query Account --output text
if ($Account -ne $ExpectedAccount) { throw "AWS account mismatch: $Account" }

$ProviderArn = "arn:aws:iam::$ExpectedAccount`:oidc-provider/token.actions.githubusercontent.com"
& $Aws iam get-open-id-connect-provider --profile $AwsProfile --open-id-connect-provider-arn $ProviderArn 2>$null
if ($LASTEXITCODE -ne 0) {
  & $Aws iam create-open-id-connect-provider --profile $AwsProfile `
    --url 'https://token.actions.githubusercontent.com' `
    --client-id-list 'sts.amazonaws.com' `
    --tags Key=Project,Value=Lunumia Key=Purpose,Value=GitHubActionsOIDC
}

& $Aws iam get-role --profile $AwsProfile --role-name lunumia-github-web-deploy 2>$null
if ($LASTEXITCODE -ne 0) {
  & $Aws iam create-role --profile $AwsProfile `
    --role-name lunumia-github-web-deploy `
    --max-session-duration 3600 `
    --assume-role-policy-document 'file://infra/aws/github-web-deploy-trust-policy.json' `
    --tags Key=Project,Value=Lunumia Key=Purpose,Value=WebDeployment
} else {
  & $Aws iam update-assume-role-policy --profile $AwsProfile `
    --role-name lunumia-github-web-deploy `
    --policy-document 'file://infra/aws/github-web-deploy-trust-policy.json'
}

& $Aws iam put-role-policy --profile $AwsProfile `
  --role-name lunumia-github-web-deploy `
  --policy-name lunumia-web-deploy `
  --policy-document 'file://infra/aws/github-web-deploy-permissions.json'
```

## Artifact and cache behavior

Both buckets remain private behind CloudFront OAC. Bucket versioning is enabled.
The workflow uses `--delete` only inside these verified, deploy-dedicated
buckets so removed generated files do not remain live; versioning provides an
additional recovery layer.

App deploys `dist/`. `assets/*` and content-addressed `workbox-*.js` receive
`public,max-age=31536000,immutable`. HTML, `sw.js`,
`manifest.webmanifest`, icons, and all other mutable files receive
`no-cache,max-age=0,must-revalidate`.

App invalidates `/*`: the CloudFront viewer-request function rewrites many SPA
routes to `index.html`, but CloudFront can cache those viewer paths separately.
A narrow entry-point invalidation could therefore leave `/login` or another
route serving stale HTML and delay a PWA update.

Landing deploys `dist-landing/`. Its hashed `assets/*` are immutable; HTML and
root images are no-cache. Landing invalidates only its mutable root files.

## Verification and observability

Every deploy records the commit SHA, selected/skipped surfaces, invalidation
IDs, and final smoke status in the workflow log and job summary.

App smoke checks `/`, `/login`, `/verify-email`, `/reset-password`, and
`/manifest.webmanifest` for HTTP 200. Landing smoke checks HTTP 200 and the
expected H1. WWW must return 301 while preserving path/query. All three hosts
must retain `Strict-Transport-Security: max-age=86400`.

The workflow does not modify CloudFront functions, aliases, certificates,
response-header policies, HSTS, OAC, bucket policies, public access, or DNS.

## Manual rerun

In GitHub, open **Actions → Deploy production web → Run workflow**, select the
`dev` branch and target, then approve the pending `production` deployment.
Manual runs from any other branch fail closed before AWS authentication.

## Failure diagnosis

1. Confirm the CI gate passed; required failures are never ignored.
2. Confirm the `production` Environment approved the exact `dev` commit.
3. For OIDC errors, compare the role trust subject exactly with the immutable
   subject above and confirm audience `sts.amazonaws.com`.
4. For S3 errors, inspect only the role's inline policy and the two target
   buckets. Do not add wildcard permissions.
5. For smoke failures, inspect the invalidation status, object cache metadata,
   and the existing CloudFront Function/response-header policy without changing
   them as part of a retry.

## Rollback

Rollback is a forward redeploy of a known-good commit, never `git reset`, force
push, or destructive automatic S3 restoration:

1. identify the last known-good commit;
2. create a normal revert commit on `dev` that restores the known-good source;
3. run CI and obtain production approval;
4. rebuild and redeploy the selected surface;
5. wait for invalidation and repeat the public smokes.

S3 version history may assist forensic recovery, but the canonical rollback is
a reproducible artifact rebuild from source.

## Explicit exclusions

The web workflows never run `supabase db push`, `supabase migration up`, Edge
Function deployment, APK/AAB builds, Android signing, DNS changes, or AWS
infrastructure mutation. Database and Edge releases remain separately
authorized production tasks. The existing PowerShell deploy script is retained
only as a reviewed break-glass procedure; it is no longer the normal release
path.
