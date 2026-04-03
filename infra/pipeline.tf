# CodePipeline: GitHub (CodeStar Connection) → CodeBuild → terraform apply + frontend publish.

resource "aws_s3_bucket" "pipeline_artifacts" {
  bucket = "${local.name_env}-pipeline-artifacts-${substr(md5(data.aws_caller_identity.current.account_id), 0, 8)}"
}

resource "aws_s3_bucket_versioning" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "pipeline_artifacts" {
  bucket = aws_s3_bucket.pipeline_artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "codebuild_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "codebuild" {
  name               = "${local.name_env}-codebuild"
  assume_role_policy = data.aws_iam_policy_document.codebuild_assume.json
}

data "aws_iam_policy_document" "codebuild_policy" {
  # Terraform remote state — S3 bucket and DynamoDB lock table.
  statement {
    sid = "TerraformStateS3"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:GetBucketVersioning",
      "s3:GetBucketLocation",
    ]
    resources = [
      "arn:${data.aws_partition.current.partition}:s3:::${var.terraform_state_bucket}",
      "arn:${data.aws_partition.current.partition}:s3:::${var.terraform_state_bucket}/*",
    ]
  }

  statement {
    sid = "TerraformStateLock"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
    ]
    resources = [
      "arn:${data.aws_partition.current.partition}:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${var.terraform_lock_table}",
    ]
  }

  # S3 — pipeline artifacts bucket and all project buckets (names are ${local.name_env}-*).
  statement {
    sid     = "S3ProjectBuckets"
    actions = ["s3:*"]
    resources = [
      "arn:${data.aws_partition.current.partition}:s3:::${local.name_env}-*",
      "arn:${data.aws_partition.current.partition}:s3:::${local.name_env}-*/*",
    ]
  }

  # Lambda — project functions only.
  statement {
    sid     = "Lambda"
    actions = ["lambda:*"]
    resources = [
      "arn:${data.aws_partition.current.partition}:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${local.name_env}-*",
    ]
  }

  # DynamoDB — project tables only.
  statement {
    sid     = "DynamoDB"
    actions = ["dynamodb:*"]
    resources = [
      "arn:${data.aws_partition.current.partition}:dynamodb:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:table/${local.name_env}-*",
    ]
  }

  # API Gateway V2 — all APIs in the account/region (no stable ARN before creation).
  statement {
    sid     = "APIGateway"
    actions = ["apigateway:*"]
    resources = [
      "arn:${data.aws_partition.current.partition}:apigateway:${data.aws_region.current.name}::/apis",
      "arn:${data.aws_partition.current.partition}:apigateway:${data.aws_region.current.name}::/apis/*",
      "arn:${data.aws_partition.current.partition}:apigateway:${data.aws_region.current.name}::/domainnames",
      "arn:${data.aws_partition.current.partition}:apigateway:${data.aws_region.current.name}::/domainnames/*",
    ]
  }

  # CloudFront — distributions and cache policies (global service, no region in ARN).
  statement {
    sid       = "CloudFront"
    actions   = ["cloudfront:*"]
    resources = ["*"]
  }

  # Cognito — all user pools in the account (pool ID not known until after creation).
  statement {
    sid     = "Cognito"
    actions = ["cognito-idp:*"]
    resources = [
      "arn:${data.aws_partition.current.partition}:cognito-idp:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:userpool/*",
    ]
  }

  # IAM — create/manage roles and policies for this project only.
  statement {
    sid = "IAMProjectRoles"
    actions = [
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:UpdateRole",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:ListAttachedRolePolicies",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:ListRoleTags",
      "iam:PassRole",
    ]
    resources = [
      "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:role/${local.name_env}-*",
    ]
  }

  statement {
    sid = "IAMReadOnly"
    actions = [
      "iam:ListRoles",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:ListPolicyVersions",
    ]
    resources = ["*"]
  }

  # SSM — project parameters only.
  statement {
    sid = "SSM"
    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
      "ssm:PutParameter",
      "ssm:DeleteParameter",
      "ssm:AddTagsToResource",
      "ssm:ListTagsForResource",
    ]
    resources = [
      "arn:${data.aws_partition.current.partition}:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter/${local.name_env}/*",
    ]
  }

  # SSM DescribeParameters is a list operation — IAM does not support resource-level restrictions.
  statement {
    sid       = "SSMDescribe"
    actions   = ["ssm:DescribeParameters"]
    resources = ["*"]
  }

  # CloudWatch Logs — project log groups only.
  statement {
    sid = "CloudWatchLogs"
    actions = [
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy",
      "logs:ListTagsLogGroup",
      "logs:ListTagsForResource",
      "logs:TagLogGroup",
      "logs:TagResource",
      "logs:UntagLogGroup",
      "logs:UntagResource",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/codebuild/${local.name_env}-*",
      "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/codebuild/${local.name_env}-*:*",
      "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.name_env}-*",
      "arn:${data.aws_partition.current.partition}:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.name_env}-*:*",
    ]
  }

  # DescribeLogGroups is a list operation — IAM does not support resource-level restrictions.
  statement {
    sid       = "CloudWatchLogsDescribe"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"]
  }

  # CodeBuild — self-management of the deploy project.
  statement {
    sid     = "CodeBuild"
    actions = ["codebuild:*"]
    resources = [
      "arn:${data.aws_partition.current.partition}:codebuild:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:project/${local.name_env}-*",
    ]
  }

  # CodePipeline — self-management of the deploy pipeline.
  statement {
    sid     = "CodePipeline"
    actions = ["codepipeline:*"]
    resources = [
      "arn:${data.aws_partition.current.partition}:codepipeline:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${local.name_env}-*",
    ]
  }

  # CodeStar Connections — allow using the GitHub connection.
  statement {
    sid       = "CodeStarConnections"
    actions   = ["codestar-connections:UseConnection"]
    resources = [var.github_connection_arn]
  }

  # Route53 — DNS records for custom domains.
  statement {
    sid = "Route53"
    actions = [
      "route53:ChangeResourceRecordSets",
      "route53:GetChange",
      "route53:GetHostedZone",
      "route53:ListResourceRecordSets",
      "route53:ListHostedZones",
    ]
    resources = ["*"]
  }

  # ACM — TLS certificates for custom domains.
  statement {
    sid = "ACM"
    actions = [
      "acm:RequestCertificate",
      "acm:DescribeCertificate",
      "acm:DeleteCertificate",
      "acm:ListCertificates",
      "acm:AddTagsToCertificate",
      "acm:ListTagsForCertificate",
      "acm:GetCertificate",
    ]
    resources = ["*"]
  }

  # Resource Groups — project tag-based groups.
  statement {
    sid = "ResourceGroups"
    actions = [
      "resource-groups:CreateGroup",
      "resource-groups:DeleteGroup",
      "resource-groups:GetGroup",
      "resource-groups:GetGroupConfiguration",
      "resource-groups:GetGroupQuery",
      "resource-groups:UpdateGroup",
      "resource-groups:UpdateGroupQuery",
      "resource-groups:GetTags",
      "resource-groups:Tag",
      "resource-groups:Untag",
      "resource-groups:ListGroupResources",
      "tag:GetResources",
      "tag:TagResources",
      "tag:UntagResources",
    ]
    resources = ["*"]
  }

  # STS — read caller identity (used by Terraform data sources).
  statement {
    sid       = "STSReadOnly"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "codebuild" {
  name   = "deploy"
  role   = aws_iam_role.codebuild.id
  policy = data.aws_iam_policy_document.codebuild_policy.json
}

resource "aws_cloudwatch_log_group" "codebuild" {
  name              = "/aws/codebuild/${local.name_env}-deploy"
  retention_in_days = 14
}

resource "aws_codebuild_project" "deploy" {
  name         = "${local.name_env}-deploy"
  service_role = aws_iam_role.codebuild.arn

  artifacts {
    type = "CODEPIPELINE"
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = "buildspec.yml"
  }

  environment {
    compute_type                = "BUILD_GENERAL1_SMALL"
    image                       = "aws/codebuild/amazonlinux2-x86_64-standard:5.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

    environment_variable {
      name  = "TF_BACKEND_REGION"
      value = var.aws_region
    }

    environment_variable {
      name  = "TF_STATE_BUCKET"
      value = var.terraform_state_bucket
    }
    environment_variable {
      name  = "TF_STATE_KEY"
      value = var.terraform_state_key
    }
    environment_variable {
      name  = "TF_LOCK_TABLE"
      value = var.terraform_lock_table
    }
    environment_variable {
      name  = "TF_VAR_aws_region"
      value = var.aws_region
    }

    environment_variable {
      name  = "TF_VAR_environment"
      value = var.environment
    }
    environment_variable {
      name  = "TF_VAR_frontend_public_url"
      value = var.frontend_public_url
    }
    environment_variable {
      name  = "TF_VAR_api_public_url"
      value = var.api_public_url
    }
    environment_variable {
      name  = "TF_VAR_images_public_url"
      value = var.images_public_url
    }
    environment_variable {
      name  = "TF_VAR_route53_zone_id"
      value = var.route53_zone_id
    }
    environment_variable {
      name  = "TF_VAR_terraform_state_bucket"
      value = var.terraform_state_bucket
    }
    environment_variable {
      name  = "TF_VAR_terraform_state_key"
      value = var.terraform_state_key
    }
    environment_variable {
      name  = "TF_VAR_terraform_lock_table"
      value = var.terraform_lock_table
    }
    environment_variable {
      name  = "TF_VAR_github_connection_arn"
      value = var.github_connection_arn
    }
    environment_variable {
      name  = "TF_VAR_github_repository_id"
      value = var.github_repository_id
    }
    environment_variable {
      name  = "TF_VAR_github_branch"
      value = var.github_branch
    }
    environment_variable {
      name  = "TF_VAR_images_cdn_base_url"
      value = var.images_cdn_base_url
    }
    environment_variable {
      name  = "TF_VAR_text_moderation_toxic_score_threshold"
      value = tostring(var.text_moderation_toxic_score_threshold)
    }
    environment_variable {
      name  = "TF_VAR_image_moderation_rekognition_min_confidence"
      value = tostring(var.image_moderation_rekognition_min_confidence)
    }
    environment_variable {
      name  = "TF_VAR_image_moderation_manual_review_min_confidence"
      value = tostring(var.image_moderation_manual_review_min_confidence)
    }
    environment_variable {
      name  = "TF_VAR_image_moderation_auto_reject_min_confidence"
      value = tostring(var.image_moderation_auto_reject_min_confidence)
    }
  }

  logs_config {
    cloudwatch_logs {
      group_name = aws_cloudwatch_log_group.codebuild.name
      status     = "ENABLED"
    }
  }
}

data "aws_iam_policy_document" "codepipeline_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["codepipeline.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "codepipeline" {
  name               = "${local.name_env}-codepipeline"
  assume_role_policy = data.aws_iam_policy_document.codepipeline_assume.json
}

data "aws_iam_policy_document" "codepipeline_policy" {
  statement {
    sid = "ArtifactsS3"
    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
      "s3:GetBucketVersioning",
      "s3:GetBucketLocation",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.pipeline_artifacts.arn,
      "${aws_s3_bucket.pipeline_artifacts.arn}/*",
    ]
  }

  statement {
    sid = "CodeBuild"
    actions = [
      "codebuild:BatchGetBuilds",
      "codebuild:StartBuild",
    ]
    resources = [aws_codebuild_project.deploy.arn]
  }

  statement {
    sid       = "CodeStarConnection"
    actions   = ["codestar-connections:UseConnection"]
    resources = [var.github_connection_arn]
  }

  statement {
    sid       = "PassCodeBuildRole"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.codebuild.arn]
  }
}

resource "aws_iam_role_policy" "codepipeline" {
  name   = "pipeline"
  role   = aws_iam_role.codepipeline.id
  policy = data.aws_iam_policy_document.codepipeline_policy.json
}

resource "aws_codepipeline" "main" {
  name     = "${local.name_env}-pipeline"
  role_arn = aws_iam_role.codepipeline.arn

  artifact_store {
    location = aws_s3_bucket.pipeline_artifacts.bucket
    type     = "S3"
  }

  stage {
    name = "Source"

    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source_output"]

      configuration = {
        ConnectionArn    = var.github_connection_arn
        FullRepositoryId = var.github_repository_id
        BranchName       = var.github_branch
      }
    }
  }

  stage {
    name = "Deploy"

    action {
      name            = "BuildAndApply"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["source_output"]

      configuration = {
        ProjectName = aws_codebuild_project.deploy.name
      }
    }
  }
}
