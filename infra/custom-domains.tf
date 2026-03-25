locals {
  _f_in  = trimspace(var.frontend_public_url)
  _a_in  = trimspace(var.api_public_url)
  _f_nop = lower(trimsuffix(replace(replace(local._f_in, "https://", ""), "http://", ""), "/"))
  _a_nop = lower(trimsuffix(replace(replace(local._a_in, "https://", ""), "http://", ""), "/"))

  frontend_host = local._f_nop
  api_host      = local._a_nop

  cert_domain_names = distinct(compact([local.frontend_host, local.api_host]))
}

resource "aws_acm_certificate" "cloudfront" {
  provider = aws.us_east_1

  domain_name               = local.cert_domain_names[0]
  subject_alternative_names = length(local.cert_domain_names) > 1 ? slice(local.cert_domain_names, 1, length(local.cert_domain_names)) : []
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cloudfront.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = var.route53_zone_id
}

resource "aws_acm_certificate_validation" "cloudfront" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.cloudfront.arn
  validation_record_fqdns = [for r in aws_route53_record.acm_validation : r.fqdn]
}

resource "aws_route53_record" "frontend_alias" {
  zone_id = var.route53_zone_id
  name    = local.frontend_host
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "frontend_alias_ipv6" {
  zone_id = var.route53_zone_id
  name    = local.frontend_host
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.frontend.domain_name
    zone_id                = aws_cloudfront_distribution.frontend.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api_alias" {
  zone_id = var.route53_zone_id
  name    = local.api_host
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.api.domain_name
    zone_id                = aws_cloudfront_distribution.api.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api_alias_ipv6" {
  zone_id = var.route53_zone_id
  name    = local.api_host
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.api.domain_name
    zone_id                = aws_cloudfront_distribution.api.hosted_zone_id
    evaluate_target_health = false
  }
}
