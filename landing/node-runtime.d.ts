declare module 'node:fs' {
  export function readFileSync(
    path: string,
    options: { encoding: 'utf8' } | 'utf8',
  ): string
}

declare const process: {
  cwd(): string
}
