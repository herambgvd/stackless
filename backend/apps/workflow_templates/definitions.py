"""
Pre-built workflow templates. Each template is a dict that maps directly
to the Workflow + WorkflowStep model structure.
"""
from __future__ import annotations

WORKFLOW_TEMPLATES = [
    {
        "id": "welcome_email",
        "name": "Welcome Email on Record Create",
        "description": "Automatically send a welcome notification whenever a new record is created in any model.",
        "category": "notifications",
        "tags": ["email", "onboarding", "automation"],
        "icon": "Mail",
        "color": "#6366f1",
        "workflow": {
            "name": "Welcome Email on Create",
            "trigger": {
                "type": "record_event",
                "event": "on_create",
            },
            "steps": [
                {
                    "id": "step_1",
                    "name": "Send Welcome Notification",
                    "type": "send_notification",
                    "order": 0,
                    "config": {
                        "channel": "email",
                        "recipient": "{{created_by}}",
                        "template_id": None,
                        "subject": "Welcome! Your record has been created",
                        "message": "A new record has been successfully created.",
                    },
                    "next_step_id": None,
                }
            ],
        },
    },
    {
        "id": "slack_alert_on_status",
        "name": "Slack Alert on Status Change",
        "description": "Send a Slack webhook notification when a record's status field is updated.",
        "category": "integrations",
        "tags": ["slack", "notifications", "status"],
        "icon": "MessageSquare",
        "color": "#10b981",
        "workflow": {
            "name": "Slack Alert on Status Change",
            "trigger": {
                "type": "record_event",
                "event": "on_update",
                "field_name": "status",
            },
            "steps": [
                {
                    "id": "step_1",
                    "name": "Post to Slack",
                    "type": "http_request",
                    "order": 0,
                    "config": {
                        "method": "POST",
                        "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
                        "headers": {"Content-Type": "application/json"},
                        "body": {
                            "text": "Record status changed to: {{status}}",
                        },
                    },
                    "next_step_id": None,
                }
            ],
        },
    },
    {
        "id": "escalate_overdue",
        "name": "Escalate Overdue Items",
        "description": "Runs on a schedule to notify the team about overdue records (tickets, tasks, invoices).",
        "category": "operations",
        "tags": ["schedule", "escalation", "sla"],
        "icon": "AlertTriangle",
        "color": "#ef4444",
        "workflow": {
            "name": "Escalate Overdue Items",
            "trigger": {
                "type": "schedule",
                "cron_expression": "0 9 * * *",  # Daily at 9 AM
            },
            "steps": [
                {
                    "id": "step_1",
                    "name": "Check Overdue Condition",
                    "type": "conditional_branch",
                    "order": 0,
                    "config": {},
                    "branch_conditions": [
                        {
                            "condition": {"field": "status", "operator": "not_equals", "value": "resolved"},
                            "next_step_id": "step_2",
                            "label": "Still open",
                        }
                    ],
                    "next_step_id": None,
                },
                {
                    "id": "step_2",
                    "name": "Send Escalation Notification",
                    "type": "send_notification",
                    "order": 1,
                    "config": {
                        "channel": "in_app",
                        "recipient": "{{assigned_to}}",
                        "message": "Overdue item requires attention: {{title}}",
                    },
                    "next_step_id": None,
                },
            ],
        },
    },
    {
        "id": "auto_archive",
        "name": "Auto-Archive Old Records",
        "description": "Daily schedule to auto-archive records that have been in a completed/closed state.",
        "category": "operations",
        "tags": ["schedule", "archive", "cleanup"],
        "icon": "Archive",
        "color": "#8b5cf6",
        "workflow": {
            "name": "Auto-Archive Old Records",
            "trigger": {
                "type": "schedule",
                "cron_expression": "0 2 * * *",  # Daily at 2 AM
            },
            "steps": [
                {
                    "id": "step_1",
                    "name": "Update Status to Archived",
                    "type": "update_record",
                    "order": 0,
                    "config": {
                        "record_id": "{{record_id}}",
                        "data": {"status": "archived"},
                    },
                    "next_step_id": None,
                }
            ],
        },
    },
    {
        "id": "approval_request_on_create",
        "name": "Request Approval on Record Create",
        "description": "Automatically trigger an approval request whenever a new record is created.",
        "category": "approvals",
        "tags": ["approval", "review", "compliance"],
        "icon": "CheckCircle",
        "color": "#f59e0b",
        "workflow": {
            "name": "Request Approval on Create",
            "trigger": {
                "type": "record_event",
                "event": "on_create",
            },
            "steps": [
                {
                    "id": "step_1",
                    "name": "Trigger Approval",
                    "type": "trigger_approval",
                    "order": 0,
                    "config": {
                        "flow_id": "REPLACE_WITH_APPROVAL_FLOW_ID",
                        "record_id": "{{record_id}}",
                        "model_id": "{{model_id}}",
                    },
                    "next_step_id": None,
                }
            ],
        },
    },
    {
        "id": "notify_on_high_value",
        "name": "Alert on High-Value Record",
        "description": "Send a notification when a numeric field (amount, price, score) exceeds a threshold.",
        "category": "notifications",
        "tags": ["threshold", "finance", "alert"],
        "icon": "TrendingUp",
        "color": "#22d3ee",
        "workflow": {
            "name": "High-Value Record Alert",
            "trigger": {
                "type": "record_event",
                "event": "on_create",
            },
            "steps": [
                {
                    "id": "step_1",
                    "name": "Check Value Threshold",
                    "type": "conditional_branch",
                    "order": 0,
                    "config": {},
                    "branch_conditions": [
                        {
                            "condition": {"field": "amount", "operator": "greater_than", "value": 1000},
                            "next_step_id": "step_2",
                            "label": "High value",
                        }
                    ],
                    "next_step_id": None,
                },
                {
                    "id": "step_2",
                    "name": "Notify Manager",
                    "type": "send_notification",
                    "order": 1,
                    "config": {
                        "channel": "in_app",
                        "recipient": "{{created_by}}",
                        "message": "High value record created: ${{amount}}",
                    },
                    "next_step_id": None,
                },
            ],
        },
    },
    {
        "id": "multi_step_onboarding",
        "name": "Multi-Step Onboarding Workflow",
        "description": "Send a welcome email, wait 24 hours, then send a follow-up notification.",
        "category": "onboarding",
        "tags": ["email", "onboarding", "delay", "sequence"],
        "icon": "Users",
        "color": "#ec4899",
        "workflow": {
            "name": "Multi-Step Onboarding",
            "trigger": {
                "type": "record_event",
                "event": "on_create",
            },
            "steps": [
                {
                    "id": "step_1",
                    "name": "Send Welcome Email",
                    "type": "send_notification",
                    "order": 0,
                    "config": {
                        "channel": "email",
                        "recipient": "{{email}}",
                        "message": "Welcome! Your account has been created.",
                    },
                    "next_step_id": "step_2",
                },
                {
                    "id": "step_2",
                    "name": "Wait 24 Hours",
                    "type": "wait_delay",
                    "order": 1,
                    "config": {"delay_seconds": 86400},
                    "next_step_id": "step_3",
                },
                {
                    "id": "step_3",
                    "name": "Send Follow-Up",
                    "type": "send_notification",
                    "order": 2,
                    "config": {
                        "channel": "email",
                        "recipient": "{{email}}",
                        "message": "How are you getting on? Let us know if you need any help.",
                    },
                    "next_step_id": None,
                },
            ],
        },
    },
    {
        "id": "webhook_integration",
        "name": "Webhook Integration on Record Update",
        "description": "Call an external webhook whenever a record is updated — perfect for Zapier, n8n, or custom integrations.",
        "category": "integrations",
        "tags": ["webhook", "integration", "api"],
        "icon": "Webhook",
        "color": "#14b8a6",
        "workflow": {
            "name": "Outbound Webhook on Update",
            "trigger": {
                "type": "record_event",
                "event": "on_update",
            },
            "steps": [
                {
                    "id": "step_1",
                    "name": "Call External Webhook",
                    "type": "http_request",
                    "order": 0,
                    "config": {
                        "method": "POST",
                        "url": "https://your-webhook-endpoint.com/hook",
                        "headers": {
                            "Content-Type": "application/json",
                            "X-Secret": "your-secret-token",
                        },
                        "body": {
                            "record_id": "{{record_id}}",
                            "event": "record.updated",
                            "data": "{{record_data}}",
                        },
                    },
                    "next_step_id": None,
                }
            ],
        },
    },
]

TEMPLATE_BY_ID = {t["id"]: t for t in WORKFLOW_TEMPLATES}
