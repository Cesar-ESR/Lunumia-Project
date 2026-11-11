# Cloudflare WAF Custom Rule for Lunumia SPA Fallback Protection
# Terraform resource definition for Cloudflare Ruleset Engine (phase: http_request_firewall_custom)

terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

variable "zone_id" {
  type        = string
  description = "The Cloudflare Zone ID for lunumia.com"
}

resource "cloudflare_ruleset" "spa_fallback_protection" {
  zone_id     = var.zone_id
  name        = "Block dotfiles, API probes and prevent illegitimate SPA fallback"
  description = "Responds with HTTP 404 Not Found at Cloudflare Edge before reaching S3/CloudFront"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules {
    action = "block"
    action_parameters {
      response {
        status_code  = 404
        content_type = "application/json"
        content      = "{\"error\":\"Not Found\",\"status\":404}"
      }
    }
    expression  = "(http.request.uri.path matches \"^/\\..*\") or (http.request.uri.path matches \"^/api(/.*)?$\") or (http.request.uri.path matches \"^/server-info(/.*)?$\")"
    description = "Deny hidden files (dotfiles), /api/* and /server-info probes"
    enabled     = true
  }
}
