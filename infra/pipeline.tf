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

# Narrow this policy in production (scoped IAM, S3, Lambda, etc.).
resource "aws_iam_role_policy_attachment" "codebuild_admin" {
  role       = aws_iam_role.codebuild.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
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
