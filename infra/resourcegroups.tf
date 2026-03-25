# AWS Resource Groups — saved group in the console (filter by StackId tag from provider default_tags).

resource "aws_resourcegroups_group" "stack" {
  name = "${var.name_prefix}-stack-${var.environment}"
  # AWS allows only [\sa-zA-Z0-9_.-] in description (no = or other punctuation).
  description = "Gig-demo stack resources. Filter tag StackId matches name_prefix and environment."

  resource_query {
    query = jsonencode({
      ResourceTypeFilters = ["AWS::AllSupported"]
      TagFilters = [
        {
          Key    = "StackId"
          Values = ["${var.name_prefix}-${var.environment}"]
        }
      ]
    })
  }
}
