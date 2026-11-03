package OpenClawInstance {
    private import OpenClawImport::*;
    private import ScalarValues::*;
    package Operators {
        doc /* OpenClaw agents as software operators, each with its context, sandbox and exec posture, and the model providers they use. */
        part def Agent_client :> OpenClawAgent {
            attribute :>> id = "client";
            attribute :>> displayName = "Client";
            attribute :>> emoji = "💬";
            attribute :>> primaryModel = "ollama/glm-5.1:cloud";
            attribute :>> fallbackModels = "[\"openai/gpt-5.5\"]";
            doc /* Sanitized OpenClaw tool policy provenance: {
  "agent": {
    "allow": null,
    "alsoAllow": [
      "message",
      "sessions_send",
      "sessions_list",
      "sessions_history"
    ],
    "deny": [
      "gateway",
      "process",
      "whatsapp_login",
      "cron"
    ],
    "profile": null
  },
  "agentProvider": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  },
  "global": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": "full"
  },
  "provider": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  },
  "sandbox": {
    "allow": [
      "exec",
      "process",
      "read",
      "write",
      "edit",
      "apply_patch",
      "image",
      "sessions_list",
      "sessions_history",
      "sessions_send",
      "sessions_spawn",
      "subagents",
      "session_status",
      "message",
      "browser"
    ],
    "alsoAllow": [],
    "deny": [
      "canvas",
      "nodes",
      "gateway",
      "telegram",
      "irc",
      "googlechat",
      "slack",
      "signal",
      "imessage",
      "whatsapp_login",
      "cron"
    ],
    "profile": null
  }
} */
            ref item 'grant_sandbox:browser' : ToolGrant = Authority::'grant_client:sandbox:browser';
            ref item 'grant_sandbox:edit' : ToolGrant = Authority::'grant_client:sandbox:edit';
            ref item 'grant_sandbox:exec' : ToolGrant = Authority::'grant_client:sandbox:exec';
            ref item 'grant_sandbox:image' : ToolGrant = Authority::'grant_client:sandbox:image';
            ref item 'grant_sandbox:message' : ToolGrant = Authority::'grant_client:sandbox:message';
            ref item 'grant_sandbox:read' : ToolGrant = Authority::'grant_client:sandbox:read';
            ref item 'grant_sandbox:session_status' : ToolGrant = Authority::'grant_client:sandbox:session_status';
            ref item 'grant_sandbox:sessions_history' : ToolGrant = Authority::'grant_client:sandbox:sessions_history';
            ref item 'grant_sandbox:sessions_list' : ToolGrant = Authority::'grant_client:sandbox:sessions_list';
            ref item 'grant_sandbox:sessions_send' : ToolGrant = Authority::'grant_client:sandbox:sessions_send';
            ref item 'grant_sandbox:sessions_spawn' : ToolGrant = Authority::'grant_client:sandbox:sessions_spawn';
            ref item 'grant_sandbox:subagents' : ToolGrant = Authority::'grant_client:sandbox:subagents';
            ref item 'grant_sandbox:write' : ToolGrant = Authority::'grant_client:sandbox:write';
            ref item 'grant_sandbox:cli:safe-bin:python3' : ToolGrant = Authority::'grant_client:sandbox:cli:safe-bin:python3';
            ref item 'grant_sandbox:cli:safe-bin:wc' : ToolGrant = Authority::'grant_client:sandbox:cli:safe-bin:wc';
        }
        part agent_client : Agent_client {
            part :>> context {
                part 'file_AGENTS.md' :> instructions {
                    attribute :>> path = "AGENTS.md";
                    attribute :>> sha256 = "b950438849e5142c35fa7ebc87aa7e9b154aa0a0c84712d947359af840112b29";
                    attribute :>> bytes = 83;
                }
                part 'file_HEARTBEAT.md' :> instructions {
                    attribute :>> path = "HEARTBEAT.md";
                    attribute :>> sha256 = "83975abb7223dec0054d67f8d598cfe88daf98c6dc231f03c213bb8090da7453";
                    attribute :>> bytes = 86;
                }
                part 'file_IDENTITY.md' :> instructions {
                    attribute :>> path = "IDENTITY.md";
                    attribute :>> sha256 = "80b668ffd828e5b38866bc71b054cf86b71516fbb443a29ec0e0ea5147333999";
                    attribute :>> bytes = 85;
                }
                part 'file_SOUL.md' :> instructions {
                    attribute :>> path = "SOUL.md";
                    attribute :>> sha256 = "eec7dd6bb4b9514528af8afe47695e76451a4385900eb969404fd3e0fa310add";
                    attribute :>> bytes = 81;
                }
                part 'file_TOOLS.md' :> instructions {
                    attribute :>> path = "TOOLS.md";
                    attribute :>> sha256 = "c2f6e3ec23572457356b96fb1391dccab8332dacc75520712d370f8e18bf61ea";
                    attribute :>> bytes = 82;
                }
                part 'file_USER.md' :> instructions {
                    attribute :>> path = "USER.md";
                    attribute :>> sha256 = "4095ca5c455b82bfc396032f8ac37eb187d395c6d87a83ccca0a32361e688d92";
                    attribute :>> bytes = 81;
                }
                part 'skill_skill-ab' :> skills {
                    attribute :>> id = "skill-ab";
                    attribute :>> source = "skills/skill-ab/SKILL.md";
                    attribute :>> digest = "7e609512e7994fb792b23cb6da1bae7946c23fab711aab0a12be96db59656849";
                }
                part 'skill_skill-x' :> skills {
                    attribute :>> id = "skill-x";
                    attribute :>> source = "skills/skill-x/SKILL.md";
                    attribute :>> digest = "45e563f9d5529c8b8444dbc985ec6b71960d9e22d5ce7b61b2bf325f6ba28317";
                }
                part 'skill_skill-z' :> skills {
                    attribute :>> id = "skill-z";
                    attribute :>> source = "skills/skill-z/SKILL.md";
                    attribute :>> digest = "1cded481d858c1e173bac2c78278afc2557348b88b78895cc50950420f70e3be";
                }
                part :>> memory {
                    attribute :>> searchEnabled = true;
                    attribute :>> searchProvider = "local";
                    attribute :>> searchFallback = "none";
                    attribute :>> searchSources = "[\"memory\"]";
                    attribute :>> extraPathCount = 0;
                    attribute :>> multimodal = false;
                    attribute :>> dailyCount = 0;
                    attribute :>> dailyBytes = 0;
                    attribute :>> otherCount = 0;
                }
            }
            part sandbox : Sandbox {
                attribute :>> mode = "all";
                attribute :>> scope = "agent";
                attribute :>> workspaceAccess = "rw";
                attribute :>> image = "openclaw-sandbox:fixture";
                attribute :>> readOnlyRoot = true;
                attribute :>> network = "fixture-net";
                attribute :>> memory = "1536m";
                attribute :>> cpus = 2;
                attribute :>> bindCount = 1;
                attribute :>> bindModes = "[\"rw\"]";
                attribute :>> environmentNames = "[\"DATABASE_URL\",\"OAUTH_BROKER_SECRET_KEY\",\"PAGES_BASE_URL\",\"READER_API_KEY\",\"SEARCH_API_KEY\"]";
            }
            part execution : ExecutionPosture {
                attribute :>> host = "auto";
                attribute :>> security = "full";
                attribute :>> ask = "off";
                attribute :>> elevated = true;
                attribute :>> elevatedChannelsCount = 1;
                attribute :>> safeBins = "[\"jq\",\"python3\",\"wc\"]";
                attribute :>> safeBinProfiles = "[\"wc\"]";
                attribute :>> trustedDirCount = 1;
                attribute :>> pathPrependCount = 1;
                attribute :>> strictInlineEval = false;
                attribute :>> approvalSecurity = "allowlist";
                attribute :>> approvalAsk = "on-miss";
                attribute :>> effectiveSecurity = "allowlist";
                attribute :>> effectiveAsk = "on-miss";
            }
        }
        part def Agent_coach :> OpenClawAgent {
            attribute :>> id = "coach";
            attribute :>> displayName = "Coach";
            attribute :>> emoji = "🏋️";
            attribute :>> primaryModel = "ollama/glm-5.1:cloud";
            attribute :>> fallbackModels = "[\"openai/gpt-5.5\"]";
            doc /* Sanitized OpenClaw tool policy provenance: {
  "agent": {
    "allow": null,
    "alsoAllow": [
      "message",
      "sessions_send",
      "sessions_list",
      "sessions_history",
      "gateway"
    ],
    "deny": [
      "process",
      "whatsapp_login",
      "cron"
    ],
    "profile": null
  },
  "agentProvider": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  },
  "global": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": "full"
  },
  "provider": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  },
  "sandbox": {
    "allow": [
      "exec",
      "process",
      "read",
      "write",
      "edit",
      "apply_patch",
      "image",
      "web_search",
      "web_fetch",
      "sessions_list",
      "sessions_history",
      "sessions_send",
      "sessions_spawn",
      "subagents",
      "session_status",
      "message",
      "browser",
      "gateway"
    ],
    "alsoAllow": [],
    "deny": [
      "canvas",
      "nodes",
      "telegram",
      "irc",
      "googlechat",
      "slack",
      "signal",
      "imessage",
      "whatsapp_login",
      "cron"
    ],
    "profile": null
  }
} */
            ref item 'grant_sandbox:browser' : ToolGrant = Authority::'grant_coach:sandbox:browser';
            ref item 'grant_sandbox:edit' : ToolGrant = Authority::'grant_coach:sandbox:edit';
            ref item 'grant_sandbox:exec' : ToolGrant = Authority::'grant_coach:sandbox:exec';
            ref item 'grant_sandbox:gateway' : ToolGrant = Authority::'grant_coach:sandbox:gateway';
            ref item 'grant_sandbox:image' : ToolGrant = Authority::'grant_coach:sandbox:image';
            ref item 'grant_sandbox:message' : ToolGrant = Authority::'grant_coach:sandbox:message';
            ref item 'grant_sandbox:read' : ToolGrant = Authority::'grant_coach:sandbox:read';
            ref item 'grant_sandbox:session_status' : ToolGrant = Authority::'grant_coach:sandbox:session_status';
            ref item 'grant_sandbox:sessions_history' : ToolGrant = Authority::'grant_coach:sandbox:sessions_history';
            ref item 'grant_sandbox:sessions_list' : ToolGrant = Authority::'grant_coach:sandbox:sessions_list';
            ref item 'grant_sandbox:sessions_send' : ToolGrant = Authority::'grant_coach:sandbox:sessions_send';
            ref item 'grant_sandbox:sessions_spawn' : ToolGrant = Authority::'grant_coach:sandbox:sessions_spawn';
            ref item 'grant_sandbox:subagents' : ToolGrant = Authority::'grant_coach:sandbox:subagents';
            ref item 'grant_sandbox:web_fetch' : ToolGrant = Authority::'grant_coach:sandbox:web_fetch';
            ref item 'grant_sandbox:web_search' : ToolGrant = Authority::'grant_coach:sandbox:web_search';
            ref item 'grant_sandbox:write' : ToolGrant = Authority::'grant_coach:sandbox:write';
            ref item 'grant_sandbox:cli:safe-bin:python3' : ToolGrant = Authority::'grant_coach:sandbox:cli:safe-bin:python3';
            ref item 'grant_sandbox:cli:safe-bin:wc' : ToolGrant = Authority::'grant_coach:sandbox:cli:safe-bin:wc';
        }
        part agent_coach : Agent_coach {
            part :>> context {
                part 'file_AGENTS.md' :> instructions {
                    attribute :>> path = "AGENTS.md";
                    attribute :>> sha256 = "b950438849e5142c35fa7ebc87aa7e9b154aa0a0c84712d947359af840112b29";
                    attribute :>> bytes = 83;
                }
                part 'file_HEARTBEAT.md' :> instructions {
                    attribute :>> path = "HEARTBEAT.md";
                    attribute :>> sha256 = "83975abb7223dec0054d67f8d598cfe88daf98c6dc231f03c213bb8090da7453";
                    attribute :>> bytes = 86;
                }
                part 'file_IDENTITY.md' :> instructions {
                    attribute :>> path = "IDENTITY.md";
                    attribute :>> sha256 = "80b668ffd828e5b38866bc71b054cf86b71516fbb443a29ec0e0ea5147333999";
                    attribute :>> bytes = 85;
                }
                part 'file_SOUL.md' :> instructions {
                    attribute :>> path = "SOUL.md";
                    attribute :>> sha256 = "eec7dd6bb4b9514528af8afe47695e76451a4385900eb969404fd3e0fa310add";
                    attribute :>> bytes = 81;
                }
                part 'file_TOOLS.md' :> instructions {
                    attribute :>> path = "TOOLS.md";
                    attribute :>> sha256 = "c2f6e3ec23572457356b96fb1391dccab8332dacc75520712d370f8e18bf61ea";
                    attribute :>> bytes = 82;
                }
                part 'file_USER.md' :> instructions {
                    attribute :>> path = "USER.md";
                    attribute :>> sha256 = "4095ca5c455b82bfc396032f8ac37eb187d395c6d87a83ccca0a32361e688d92";
                    attribute :>> bytes = 81;
                }
                part 'skill_skill-f' :> skills {
                    attribute :>> id = "skill-f";
                    attribute :>> source = "skills/skill-f/SKILL.md";
                    attribute :>> digest = "97854d51b5123604b5a18ea662d1de99522dcf8a1dabff839e69b9d7af276b55";
                }
                part 'skill_skill-y' :> skills {
                    attribute :>> id = "skill-y";
                    attribute :>> source = "skills/skill-y/SKILL.md";
                    attribute :>> digest = "bebb44f2e2e9ab703cd57d6fe10f5eb31bb079d299ff39f3b9d24b88060a1bee";
                }
                part :>> memory {
                    attribute :>> searchEnabled = true;
                    attribute :>> searchProvider = "local";
                    attribute :>> searchFallback = "none";
                    attribute :>> searchSources = "[\"memory\"]";
                    attribute :>> extraPathCount = 0;
                    attribute :>> multimodal = false;
                    attribute :>> dailyCount = 0;
                    attribute :>> dailyBytes = 0;
                    attribute :>> otherCount = 0;
                }
            }
            part sandbox : Sandbox {
                attribute :>> mode = "all";
                attribute :>> scope = "agent";
                attribute :>> workspaceAccess = "rw";
                attribute :>> image = "openclaw-sandbox:fixture";
                attribute :>> readOnlyRoot = true;
                attribute :>> network = "fixture-net";
                attribute :>> memory = "1536m";
                attribute :>> cpus = 2;
                attribute :>> bindCount = 1;
                attribute :>> bindModes = "[\"rw\"]";
                attribute :>> environmentNames = "[\"DATABASE_URL\",\"OAUTH_BROKER_SECRET_KEY\",\"PAGES_BASE_URL\",\"READER_API_KEY\",\"SEARCH_API_KEY\"]";
            }
            part execution : ExecutionPosture {
                attribute :>> host = "auto";
                attribute :>> security = "full";
                attribute :>> ask = "off";
                attribute :>> elevated = true;
                attribute :>> elevatedChannelsCount = 1;
                attribute :>> safeBins = "[\"jq\",\"python3\",\"wc\"]";
                attribute :>> safeBinProfiles = "[\"wc\"]";
                attribute :>> trustedDirCount = 1;
                attribute :>> pathPrependCount = 1;
                attribute :>> strictInlineEval = false;
                attribute :>> approvalSecurity = "allowlist";
                attribute :>> approvalAsk = "on-miss";
                attribute :>> effectiveSecurity = "allowlist";
                attribute :>> effectiveAsk = "on-miss";
            }
        }
        part def Agent_devbox :> OpenClawAgent {
            attribute :>> id = "devbox";
            attribute :>> displayName = "Devbox";
            attribute :>> emoji = "🖖";
            attribute :>> primaryModel = "ollama/glm-5.1:cloud";
            attribute :>> fallbackModels = "[\"openai/gpt-5.5\"]";
            doc /* Sanitized OpenClaw tool policy provenance: {
  "agent": {
    "allow": null,
    "alsoAllow": [
      "message",
      "sessions_send",
      "sessions_list",
      "sessions_history"
    ],
    "deny": [
      "gateway",
      "process",
      "whatsapp_login",
      "cron"
    ],
    "profile": null
  },
  "agentProvider": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  },
  "global": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": "full"
  },
  "provider": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  },
  "sandbox": {
    "allow": [
      "exec",
      "process",
      "read",
      "write",
      "edit",
      "apply_patch",
      "image",
      "web_search",
      "web_fetch",
      "sessions_list",
      "sessions_history",
      "sessions_send",
      "sessions_spawn",
      "subagents",
      "session_status",
      "message",
      "browser"
    ],
    "alsoAllow": [],
    "deny": [
      "canvas",
      "nodes",
      "gateway",
      "telegram",
      "irc",
      "googlechat",
      "slack",
      "signal",
      "imessage",
      "whatsapp_login",
      "cron"
    ],
    "profile": null
  }
} */
            ref item 'grant_sandbox:browser' : ToolGrant = Authority::'grant_devbox:sandbox:browser';
            ref item 'grant_sandbox:edit' : ToolGrant = Authority::'grant_devbox:sandbox:edit';
            ref item 'grant_sandbox:exec' : ToolGrant = Authority::'grant_devbox:sandbox:exec';
            ref item 'grant_sandbox:image' : ToolGrant = Authority::'grant_devbox:sandbox:image';
            ref item 'grant_sandbox:message' : ToolGrant = Authority::'grant_devbox:sandbox:message';
            ref item 'grant_sandbox:read' : ToolGrant = Authority::'grant_devbox:sandbox:read';
            ref item 'grant_sandbox:session_status' : ToolGrant = Authority::'grant_devbox:sandbox:session_status';
            ref item 'grant_sandbox:sessions_history' : ToolGrant = Authority::'grant_devbox:sandbox:sessions_history';
            ref item 'grant_sandbox:sessions_list' : ToolGrant = Authority::'grant_devbox:sandbox:sessions_list';
            ref item 'grant_sandbox:sessions_send' : ToolGrant = Authority::'grant_devbox:sandbox:sessions_send';
            ref item 'grant_sandbox:sessions_spawn' : ToolGrant = Authority::'grant_devbox:sandbox:sessions_spawn';
            ref item 'grant_sandbox:subagents' : ToolGrant = Authority::'grant_devbox:sandbox:subagents';
            ref item 'grant_sandbox:web_fetch' : ToolGrant = Authority::'grant_devbox:sandbox:web_fetch';
            ref item 'grant_sandbox:web_search' : ToolGrant = Authority::'grant_devbox:sandbox:web_search';
            ref item 'grant_sandbox:write' : ToolGrant = Authority::'grant_devbox:sandbox:write';
            ref item 'grant_sandbox:cli:safe-bin:python3' : ToolGrant = Authority::'grant_devbox:sandbox:cli:safe-bin:python3';
            ref item 'grant_sandbox:cli:safe-bin:wc' : ToolGrant = Authority::'grant_devbox:sandbox:cli:safe-bin:wc';
        }
        part agent_devbox : Agent_devbox {
            part :>> context {
                part 'file_AGENTS.md' :> instructions {
                    attribute :>> path = "AGENTS.md";
                    attribute :>> sha256 = "b950438849e5142c35fa7ebc87aa7e9b154aa0a0c84712d947359af840112b29";
                    attribute :>> bytes = 83;
                }
                part 'file_HEARTBEAT.md' :> instructions {
                    attribute :>> path = "HEARTBEAT.md";
                    attribute :>> sha256 = "83975abb7223dec0054d67f8d598cfe88daf98c6dc231f03c213bb8090da7453";
                    attribute :>> bytes = 86;
                }
                part 'file_IDENTITY.md' :> instructions {
                    attribute :>> path = "IDENTITY.md";
                    attribute :>> sha256 = "80b668ffd828e5b38866bc71b054cf86b71516fbb443a29ec0e0ea5147333999";
                    attribute :>> bytes = 85;
                }
                part 'file_SOUL.md' :> instructions {
                    attribute :>> path = "SOUL.md";
                    attribute :>> sha256 = "eec7dd6bb4b9514528af8afe47695e76451a4385900eb969404fd3e0fa310add";
                    attribute :>> bytes = 81;
                }
                part 'file_TOOLS.md' :> instructions {
                    attribute :>> path = "TOOLS.md";
                    attribute :>> sha256 = "c2f6e3ec23572457356b96fb1391dccab8332dacc75520712d370f8e18bf61ea";
                    attribute :>> bytes = 82;
                }
                part 'file_USER.md' :> instructions {
                    attribute :>> path = "USER.md";
                    attribute :>> sha256 = "4095ca5c455b82bfc396032f8ac37eb187d395c6d87a83ccca0a32361e688d92";
                    attribute :>> bytes = 81;
                }
                part 'skill__archived/old-skill' :> skills {
                    attribute :>> id = "_archived/old-skill";
                    attribute :>> source = "skills/_archived/old-skill/SKILL.md";
                    attribute :>> digest = "014d5e0dac73fcebf0fda0968a2a9f804e2a843d1f336b7c2584cb599d6743ff";
                }
                part skill_escalation :> skills {
                    attribute :>> id = "escalation";
                    attribute :>> source = "skills/escalation/SKILL.md";
                    attribute :>> digest = "9016653f64a19a21a650b2e4f3a595367ffb58e08c62b7c16fcb4380e73a5237";
                }
                part :>> memory {
                    attribute :>> searchEnabled = true;
                    attribute :>> searchProvider = "local";
                    attribute :>> searchFallback = "none";
                    attribute :>> searchSources = "[\"memory\"]";
                    attribute :>> extraPathCount = 0;
                    attribute :>> multimodal = false;
                    attribute :>> dailyCount = 0;
                    attribute :>> dailyBytes = 0;
                    attribute :>> otherCount = 0;
                }
            }
            part sandbox : Sandbox {
                attribute :>> mode = "all";
                attribute :>> scope = "agent";
                attribute :>> workspaceAccess = "rw";
                attribute :>> image = "openclaw-sandbox:bookworm-slim";
                attribute :>> readOnlyRoot = true;
                attribute :>> network = "bridge";
                attribute :>> memory = "1536m";
                attribute :>> cpus = 2;
                attribute :>> bindCount = 0;
                attribute :>> bindModes = "[]";
                attribute :>> environmentNames = "[\"GATEWAY_HOST\",\"GATEWAY_PORT\",\"HOOKS_TOKEN\",\"OAUTH_BROKER_SECRET_KEY\",\"READER_API_KEY\",\"SEARCH_API_KEY\"]";
            }
            part execution : ExecutionPosture {
                attribute :>> host = "auto";
                attribute :>> security = "full";
                attribute :>> ask = "off";
                attribute :>> elevated = true;
                attribute :>> elevatedChannelsCount = 1;
                attribute :>> safeBins = "[\"jq\",\"python3\",\"wc\"]";
                attribute :>> safeBinProfiles = "[\"wc\"]";
                attribute :>> trustedDirCount = 1;
                attribute :>> pathPrependCount = 1;
                attribute :>> strictInlineEval = false;
                attribute :>> approvalSecurity = "allowlist";
                attribute :>> approvalAsk = "on-miss";
                attribute :>> effectiveSecurity = "allowlist";
                attribute :>> effectiveAsk = "on-miss";
            }
        }
        part def Agent_field :> OpenClawAgent {
            attribute :>> id = "field";
            attribute :>> displayName = "Field Assistant";
            attribute :>> primaryModel = "ollama/glm-5.1:cloud";
            attribute :>> fallbackModels = "[\"openai/gpt-5.5\"]";
            doc /* Sanitized OpenClaw tool policy provenance: {
  "agent": {
    "allow": null,
    "alsoAllow": [
      "message",
      "sessions_send",
      "sessions_list",
      "sessions_history",
      "tts"
    ],
    "deny": [
      "gateway",
      "process"
    ],
    "profile": null
  },
  "agentProvider": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  },
  "global": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": "full"
  },
  "provider": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  },
  "sandbox": {
    "allow": [
      "exec",
      "process",
      "read",
      "write",
      "edit",
      "apply_patch",
      "image",
      "pdf",
      "sessions_list",
      "sessions_history",
      "sessions_send",
      "sessions_spawn",
      "subagents",
      "session_status",
      "message",
      "browser",
      "tts",
      "docs__*"
    ],
    "alsoAllow": [],
    "deny": [
      "canvas",
      "nodes",
      "gateway",
      "telegram",
      "discord",
      "irc",
      "googlechat",
      "slack",
      "signal",
      "imessage"
    ],
    "profile": null
  }
} */
            ref item 'grant_sandbox:browser' : ToolGrant = Authority::'grant_field:sandbox:browser';
            ref item 'grant_sandbox:docs__*' : ToolGrant = Authority::'grant_field:sandbox:docs__*';
            ref item 'grant_sandbox:edit' : ToolGrant = Authority::'grant_field:sandbox:edit';
            ref item 'grant_sandbox:exec' : ToolGrant = Authority::'grant_field:sandbox:exec';
            ref item 'grant_sandbox:image' : ToolGrant = Authority::'grant_field:sandbox:image';
            ref item 'grant_sandbox:message' : ToolGrant = Authority::'grant_field:sandbox:message';
            ref item 'grant_sandbox:pdf' : ToolGrant = Authority::'grant_field:sandbox:pdf';
            ref item 'grant_sandbox:read' : ToolGrant = Authority::'grant_field:sandbox:read';
            ref item 'grant_sandbox:session_status' : ToolGrant = Authority::'grant_field:sandbox:session_status';
            ref item 'grant_sandbox:sessions_history' : ToolGrant = Authority::'grant_field:sandbox:sessions_history';
            ref item 'grant_sandbox:sessions_list' : ToolGrant = Authority::'grant_field:sandbox:sessions_list';
            ref item 'grant_sandbox:sessions_send' : ToolGrant = Authority::'grant_field:sandbox:sessions_send';
            ref item 'grant_sandbox:sessions_spawn' : ToolGrant = Authority::'grant_field:sandbox:sessions_spawn';
            ref item 'grant_sandbox:subagents' : ToolGrant = Authority::'grant_field:sandbox:subagents';
            ref item 'grant_sandbox:tts' : ToolGrant = Authority::'grant_field:sandbox:tts';
            ref item 'grant_sandbox:write' : ToolGrant = Authority::'grant_field:sandbox:write';
            ref item 'grant_sandbox:cli:safe-bin:python3' : ToolGrant = Authority::'grant_field:sandbox:cli:safe-bin:python3';
            ref item 'grant_sandbox:cli:safe-bin:wc' : ToolGrant = Authority::'grant_field:sandbox:cli:safe-bin:wc';
        }
        part agent_field : Agent_field {
            part :>> context {
                part 'file_AGENTS.md' :> instructions {
                    attribute :>> path = "AGENTS.md";
                    attribute :>> sha256 = "b950438849e5142c35fa7ebc87aa7e9b154aa0a0c84712d947359af840112b29";
                    attribute :>> bytes = 83;
                }
                part 'file_HEARTBEAT.md' :> instructions {
                    attribute :>> path = "HEARTBEAT.md";
                    attribute :>> sha256 = "83975abb7223dec0054d67f8d598cfe88daf98c6dc231f03c213bb8090da7453";
                    attribute :>> bytes = 86;
                }
                part 'file_IDENTITY.md' :> instructions {
                    attribute :>> path = "IDENTITY.md";
                    attribute :>> sha256 = "80b668ffd828e5b38866bc71b054cf86b71516fbb443a29ec0e0ea5147333999";
                    attribute :>> bytes = 85;
                }
                part 'file_MEMORY.md' :> instructions {
                    attribute :>> path = "MEMORY.md";
                    attribute :>> sha256 = "b5f5a6329599f58b01306d855af8b198f425af2f7bf2e6cb0c57caaa9784eb23";
                    attribute :>> bytes = 83;
                }
                part 'file_SOUL.md' :> instructions {
                    attribute :>> path = "SOUL.md";
                    attribute :>> sha256 = "eec7dd6bb4b9514528af8afe47695e76451a4385900eb969404fd3e0fa310add";
                    attribute :>> bytes = 81;
                }
                part 'file_TOOLS.md' :> instructions {
                    attribute :>> path = "TOOLS.md";
                    attribute :>> sha256 = "c2f6e3ec23572457356b96fb1391dccab8332dacc75520712d370f8e18bf61ea";
                    attribute :>> bytes = 82;
                }
                part 'file_USER.md' :> instructions {
                    attribute :>> path = "USER.md";
                    attribute :>> sha256 = "4095ca5c455b82bfc396032f8ac37eb187d395c6d87a83ccca0a32361e688d92";
                    attribute :>> bytes = 81;
                }
                part 'skill__archived/old-skill' :> skills {
                    attribute :>> id = "_archived/old-skill";
                    attribute :>> source = "skills/_archived/old-skill/SKILL.md";
                    attribute :>> digest = "014d5e0dac73fcebf0fda0968a2a9f804e2a843d1f336b7c2584cb599d6743ff";
                }
                part skill_escalation :> skills {
                    attribute :>> id = "escalation";
                    attribute :>> source = "skills/escalation/SKILL.md";
                    attribute :>> digest = "9016653f64a19a21a650b2e4f3a595367ffb58e08c62b7c16fcb4380e73a5237";
                }
                part 'skill_skill-1' :> skills {
                    attribute :>> id = "skill-1";
                    attribute :>> source = "skills/skill-1/SKILL.md";
                    attribute :>> digest = "5a606705b32ee492a189839360f5f82c3513a49f93a6e932b70225c012295688";
                }
                part 'skill_skill-aa' :> skills {
                    attribute :>> id = "skill-aa";
                    attribute :>> source = "skills/skill-aa/SKILL.md";
                    attribute :>> digest = "9558fb7feb3129b48fc78e76ca037a97ec0b5a0ab8ae851ca4ee74b59aa6fa7b";
                }
                part 'skill_skill-ad' :> skills {
                    attribute :>> id = "skill-ad";
                    attribute :>> source = "skills/skill-ad/SKILL.md";
                    attribute :>> digest = "56cd36b7200af5e52b4ad5f576076f0969af856e65e24ab2262347b60600fa2a";
                }
                part 'skill_skill-af' :> skills {
                    attribute :>> id = "skill-af";
                    attribute :>> source = "skills/skill-af/SKILL.md";
                    attribute :>> digest = "ac6f6b333cb367edf8ff0fd0539b42937d0017b46853df851bcdbc8bbde90e85";
                }
                part 'skill_skill-w' :> skills {
                    attribute :>> id = "skill-w";
                    attribute :>> source = "skills/skill-w/SKILL.md";
                    attribute :>> digest = "13039487b0c3a43c9fddf066738b54522c3cca19d3d4931e7ef8dcd467b4637f";
                }
                part :>> memory {
                    attribute :>> searchEnabled = true;
                    attribute :>> searchProvider = "local";
                    attribute :>> searchFallback = "none";
                    attribute :>> searchSources = "[\"memory\"]";
                    attribute :>> extraPathCount = 0;
                    attribute :>> multimodal = false;
                    attribute :>> curatedSha256 = "b5f5a6329599f58b01306d855af8b198f425af2f7bf2e6cb0c57caaa9784eb23";
                    attribute :>> curatedBytes = 83;
                    attribute :>> dailyCount = 1;
                    attribute :>> dailyFirstDate = "2026-05-30";
                    attribute :>> dailyLastDate = "2026-05-30";
                    attribute :>> dailyBytes = 16;
                    attribute :>> dailySha256 = "371942c13809f135478a482a31bd56195e4c58dfdc1994e5ba661ce959e940c9";
                    attribute :>> otherCount = 0;
                }
            }
            part sandbox : Sandbox {
                attribute :>> mode = "all";
                attribute :>> scope = "agent";
                attribute :>> workspaceAccess = "rw";
                attribute :>> image = "openclaw-sandbox:bookworm-slim";
                attribute :>> readOnlyRoot = true;
                attribute :>> network = "bridge";
                attribute :>> memory = "1536m";
                attribute :>> cpus = 2;
                attribute :>> bindCount = 1;
                attribute :>> bindModes = "[\"rw\"]";
                attribute :>> environmentNames = "[\"GATEWAY_HOST\",\"GATEWAY_PORT\",\"HOOKS_TOKEN\",\"NAS_ACCOUNT\",\"NAS_BASE_PATH\",\"NAS_HOST\",\"NAS_PASSWORD\",\"OAUTH_BROKER_SECRET_KEY\",\"OPENAI_API_KEY\",\"READER_API_KEY\",\"SEARCH_API_KEY\",\"SEO_API_PASSWORD\",\"SEO_API_TOKEN\",\"SEO_API_USER\"]";
            }
            part execution : ExecutionPosture {
                attribute :>> host = "auto";
                attribute :>> security = "full";
                attribute :>> ask = "off";
                attribute :>> elevated = true;
                attribute :>> elevatedChannelsCount = 1;
                attribute :>> safeBins = "[\"jq\",\"python3\",\"wc\"]";
                attribute :>> safeBinProfiles = "[\"wc\"]";
                attribute :>> trustedDirCount = 1;
                attribute :>> pathPrependCount = 1;
                attribute :>> strictInlineEval = false;
                attribute :>> approvalSecurity = "allowlist";
                attribute :>> approvalAsk = "on-miss";
                attribute :>> effectiveSecurity = "allowlist";
                attribute :>> effectiveAsk = "on-miss";
            }
        }
        part def Agent_lead :> OpenClawAgent {
            attribute :>> id = "lead";
            attribute :>> displayName = "Lead";
            attribute :>> emoji = "🔍";
            attribute :>> primaryModel = "ollama/glm-5.1:cloud";
            attribute :>> fallbackModels = "[\"openai/gpt-5.5\"]";
            doc /* Sanitized OpenClaw tool policy provenance: {
  "agent": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  },
  "agentProvider": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  },
  "global": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": "full"
  },
  "provider": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  },
  "sandbox": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  }
} */
            ref item 'grant_host:agents_list' : ToolGrant = Authority::'grant_lead:host:agents_list';
            ref item 'grant_host:browser' : ToolGrant = Authority::'grant_lead:host:browser';
            ref item 'grant_host:canvas' : ToolGrant = Authority::'grant_lead:host:canvas';
            ref item 'grant_host:code_execution' : ToolGrant = Authority::'grant_lead:host:code_execution';
            ref item 'grant_host:cron' : ToolGrant = Authority::'grant_lead:host:cron';
            ref item 'grant_host:docs__*' : ToolGrant = Authority::'grant_lead:host:docs__*';
            ref item 'grant_host:edit' : ToolGrant = Authority::'grant_lead:host:edit';
            ref item 'grant_host:exec' : ToolGrant = Authority::'grant_lead:host:exec';
            ref item 'grant_host:gateway' : ToolGrant = Authority::'grant_lead:host:gateway';
            ref item 'grant_host:heartbeat_respond' : ToolGrant = Authority::'grant_lead:host:heartbeat_respond';
            ref item 'grant_host:image' : ToolGrant = Authority::'grant_lead:host:image';
            ref item 'grant_host:image_generate' : ToolGrant = Authority::'grant_lead:host:image_generate';
            ref item 'grant_host:memory_get' : ToolGrant = Authority::'grant_lead:host:memory_get';
            ref item 'grant_host:memory_search' : ToolGrant = Authority::'grant_lead:host:memory_search';
            ref item 'grant_host:message' : ToolGrant = Authority::'grant_lead:host:message';
            ref item 'grant_host:music_generate' : ToolGrant = Authority::'grant_lead:host:music_generate';
            ref item 'grant_host:nodes' : ToolGrant = Authority::'grant_lead:host:nodes';
            ref item 'grant_host:outlook-graph__*' : ToolGrant = Authority::'grant_lead:host:outlook-graph__*';
            ref item 'grant_host:pdf' : ToolGrant = Authority::'grant_lead:host:pdf';
            ref item 'grant_host:process' : ToolGrant = Authority::'grant_lead:host:process';
            ref item 'grant_host:read' : ToolGrant = Authority::'grant_lead:host:read';
            ref item 'grant_host:session_status' : ToolGrant = Authority::'grant_lead:host:session_status';
            ref item 'grant_host:sessions_history' : ToolGrant = Authority::'grant_lead:host:sessions_history';
            ref item 'grant_host:sessions_list' : ToolGrant = Authority::'grant_lead:host:sessions_list';
            ref item 'grant_host:sessions_send' : ToolGrant = Authority::'grant_lead:host:sessions_send';
            ref item 'grant_host:sessions_spawn' : ToolGrant = Authority::'grant_lead:host:sessions_spawn';
            ref item 'grant_host:sessions_yield' : ToolGrant = Authority::'grant_lead:host:sessions_yield';
            ref item 'grant_host:skill_workshop' : ToolGrant = Authority::'grant_lead:host:skill_workshop';
            ref item 'grant_host:stock_quote' : ToolGrant = Authority::'grant_lead:host:stock_quote';
            ref item 'grant_host:subagents' : ToolGrant = Authority::'grant_lead:host:subagents';
            ref item 'grant_host:tts' : ToolGrant = Authority::'grant_lead:host:tts';
            ref item 'grant_host:update_plan' : ToolGrant = Authority::'grant_lead:host:update_plan';
            ref item 'grant_host:video_generate' : ToolGrant = Authority::'grant_lead:host:video_generate';
            ref item 'grant_host:web_fetch' : ToolGrant = Authority::'grant_lead:host:web_fetch';
            ref item 'grant_host:web_search' : ToolGrant = Authority::'grant_lead:host:web_search';
            ref item 'grant_host:whatsapp_login' : ToolGrant = Authority::'grant_lead:host:whatsapp_login';
            ref item 'grant_host:write' : ToolGrant = Authority::'grant_lead:host:write';
            ref item 'grant_host:x_search' : ToolGrant = Authority::'grant_lead:host:x_search';
            ref item 'grant_host:cli:name:rg' : ToolGrant = Authority::'grant_lead:host:cli:name:rg';
            ref item 'grant_host:cli:path:git' : ToolGrant = Authority::'grant_lead:host:cli:path:git';
            ref item 'grant_host:cli:safe-bin:python3' : ToolGrant = Authority::'grant_lead:host:cli:safe-bin:python3';
            ref item 'grant_host:cli:safe-bin:wc' : ToolGrant = Authority::'grant_lead:host:cli:safe-bin:wc';
        }
        part agent_lead : Agent_lead {
            part :>> context {
                part 'file_AGENTS.md' :> instructions {
                    attribute :>> path = "AGENTS.md";
                    attribute :>> sha256 = "b950438849e5142c35fa7ebc87aa7e9b154aa0a0c84712d947359af840112b29";
                    attribute :>> bytes = 83;
                }
                part 'file_HEARTBEAT.md' :> instructions {
                    attribute :>> path = "HEARTBEAT.md";
                    attribute :>> sha256 = "83975abb7223dec0054d67f8d598cfe88daf98c6dc231f03c213bb8090da7453";
                    attribute :>> bytes = 86;
                }
                part 'file_HOURLY_REPORT.md' :> instructions {
                    attribute :>> path = "HOURLY_REPORT.md";
                    attribute :>> sha256 = "312d65fa4bb6f46be04edafc751090aa6a434d4413437d0d12c06bf3d25bf40c";
                    attribute :>> bytes = 90;
                }
                part 'file_IDENTITY.md' :> instructions {
                    attribute :>> path = "IDENTITY.md";
                    attribute :>> sha256 = "80b668ffd828e5b38866bc71b054cf86b71516fbb443a29ec0e0ea5147333999";
                    attribute :>> bytes = 85;
                }
                part 'file_MEMORY.md' :> instructions {
                    attribute :>> path = "MEMORY.md";
                    attribute :>> sha256 = "b5f5a6329599f58b01306d855af8b198f425af2f7bf2e6cb0c57caaa9784eb23";
                    attribute :>> bytes = 83;
                }
                part 'file_QUALITY.md' :> instructions {
                    attribute :>> path = "QUALITY.md";
                    attribute :>> sha256 = "9ae70aeb35ae86094d059e6b1c3d1048803658185cf6d427da314c90a612fcd7";
                    attribute :>> bytes = 84;
                }
                part 'file_SOUL.md' :> instructions {
                    attribute :>> path = "SOUL.md";
                    attribute :>> sha256 = "eec7dd6bb4b9514528af8afe47695e76451a4385900eb969404fd3e0fa310add";
                    attribute :>> bytes = 81;
                }
                part 'file_TOOLS.md' :> instructions {
                    attribute :>> path = "TOOLS.md";
                    attribute :>> sha256 = "c2f6e3ec23572457356b96fb1391dccab8332dacc75520712d370f8e18bf61ea";
                    attribute :>> bytes = 82;
                }
                part 'file_USER.md' :> instructions {
                    attribute :>> path = "USER.md";
                    attribute :>> sha256 = "4095ca5c455b82bfc396032f8ac37eb187d395c6d87a83ccca0a32361e688d92";
                    attribute :>> bytes = 81;
                }
                part 'skill__archived/old-skill' :> skills {
                    attribute :>> id = "_archived/old-skill";
                    attribute :>> source = "skills/_archived/old-skill/SKILL.md";
                    attribute :>> digest = "014d5e0dac73fcebf0fda0968a2a9f804e2a843d1f336b7c2584cb599d6743ff";
                }
                part skill_escalation :> skills {
                    attribute :>> id = "escalation";
                    attribute :>> source = "skills/escalation/SKILL.md";
                    attribute :>> digest = "9016653f64a19a21a650b2e4f3a595367ffb58e08c62b7c16fcb4380e73a5237";
                }
                part 'skill_skill-a' :> skills {
                    attribute :>> id = "skill-a";
                    attribute :>> source = "skills/skill-a/SKILL.md";
                    attribute :>> digest = "9ca693e57ada940ff0f2330331a99c89795813abe606f5c34ac0534c5d5092b4";
                }
                part 'skill_skill-aa' :> skills {
                    attribute :>> id = "skill-aa";
                    attribute :>> source = "skills/skill-aa/SKILL.md";
                    attribute :>> digest = "9558fb7feb3129b48fc78e76ca037a97ec0b5a0ab8ae851ca4ee74b59aa6fa7b";
                }
                part 'skill_skill-ac' :> skills {
                    attribute :>> id = "skill-ac";
                    attribute :>> source = "skills/skill-ac/SKILL.md";
                    attribute :>> digest = "99184c50cc246dccdab6bbe7764195b788bec87858366000c903a0474fc1d366";
                }
                part 'skill_skill-ad' :> skills {
                    attribute :>> id = "skill-ad";
                    attribute :>> source = "skills/skill-ad/SKILL.md";
                    attribute :>> digest = "56cd36b7200af5e52b4ad5f576076f0969af856e65e24ab2262347b60600fa2a";
                }
                part 'skill_skill-ae' :> skills {
                    attribute :>> id = "skill-ae";
                    attribute :>> source = "skills/skill-ae/SKILL.md";
                    attribute :>> digest = "444c9a1de2cd27c0ce912e2ac5963cc62f113712bd04dec49e5ba977bda67e85";
                }
                part 'skill_skill-af' :> skills {
                    attribute :>> id = "skill-af";
                    attribute :>> source = "skills/skill-af/SKILL.md";
                    attribute :>> digest = "ac6f6b333cb367edf8ff0fd0539b42937d0017b46853df851bcdbc8bbde90e85";
                }
                part 'skill_skill-ag' :> skills {
                    attribute :>> id = "skill-ag";
                    attribute :>> source = "skills/skill-ag/SKILL.md";
                    attribute :>> digest = "7e9c5bce57935d2f04817937aacc358547bcfbb9f2b3c20d22f1c6aae16feed6";
                }
                part 'skill_skill-ah' :> skills {
                    attribute :>> id = "skill-ah";
                    attribute :>> source = "skills/skill-ah/SKILL.md";
                    attribute :>> digest = "136bfddd214a7ba3aa371c42b9157bc156e36ca080bedeacdf5ccd591cc5f7c1";
                }
                part 'skill_skill-ai' :> skills {
                    attribute :>> id = "skill-ai";
                    attribute :>> source = "skills/skill-ai/SKILL.md";
                    attribute :>> digest = "889f1a3ed0d84e4d70a8f68620b40d2307a5673d8c8abc7ca206fe51105d82a1";
                }
                part 'skill_skill-b' :> skills {
                    attribute :>> id = "skill-b";
                    attribute :>> source = "skills/skill-b/SKILL.md";
                    attribute :>> digest = "4ba04c614857ae97cb8cbfd8df099854159b3be0781b8a2a332db2bf890ee0ca";
                }
                part 'skill_skill-c' :> skills {
                    attribute :>> id = "skill-c";
                    attribute :>> source = "skills/skill-c/SKILL.md";
                    attribute :>> digest = "266d62b94a1573b46c035139e68863395b49585bc5401a26ccd22e616a55c0d6";
                }
                part 'skill_skill-d' :> skills {
                    attribute :>> id = "skill-d";
                    attribute :>> source = "skills/skill-d/SKILL.md";
                    attribute :>> digest = "b07a1de09c706da4bef569d18998ec720a3fb10f7bdea1e5780eaa67087b5fec";
                }
                part 'skill_skill-e' :> skills {
                    attribute :>> id = "skill-e";
                    attribute :>> source = "skills/skill-e/SKILL.md";
                    attribute :>> digest = "4b1c2ed9c2a55afb87e2908a782dff18613b132740b61e15b0146ff51319efe3";
                }
                part 'skill_skill-g' :> skills {
                    attribute :>> id = "skill-g";
                    attribute :>> source = "skills/skill-g/SKILL.md";
                    attribute :>> digest = "69da147fe174898130411b72d1548fc4995423fbae5d8c0a09196a88cc51cccf";
                }
                part 'skill_skill-h' :> skills {
                    attribute :>> id = "skill-h";
                    attribute :>> source = "skills/skill-h/SKILL.md";
                    attribute :>> digest = "e579a18b2ff2c9abbf3f7eb985a9ff3d59874ec40c17005e863ce2c9b342d8ac";
                }
                part 'skill_skill-i' :> skills {
                    attribute :>> id = "skill-i";
                    attribute :>> source = "skills/skill-i/SKILL.md";
                    attribute :>> digest = "d2757c119ce2c3ad26b931afd4446010077fe0c7de24dafbf1a5656fd7f6a95c";
                }
                part 'skill_skill-j' :> skills {
                    attribute :>> id = "skill-j";
                    attribute :>> source = "skills/skill-j/SKILL.md";
                    attribute :>> digest = "dae38a8f9ed3e9b1e37b14f494fef4a277de66f4da503d4887cbf7bd1a50377d";
                }
                part 'skill_skill-k' :> skills {
                    attribute :>> id = "skill-k";
                    attribute :>> source = "skills/skill-k/SKILL.md";
                    attribute :>> digest = "b0dc29f43cc461359d37924ed4f9c95ebd7dec3cecfe4de409b4f1c6ce025b5c";
                }
                part 'skill_skill-l' :> skills {
                    attribute :>> id = "skill-l";
                    attribute :>> source = "skills/skill-l/SKILL.md";
                    attribute :>> digest = "104d8e0c94e383e3de6d2aa3358ea71032563ff729ffb16e3fb63d1615e57832";
                }
                part 'skill_skill-m' :> skills {
                    attribute :>> id = "skill-m";
                    attribute :>> source = "skills/skill-m/SKILL.md";
                    attribute :>> digest = "b1a0627a57cab6fbb823b4a9053b4d3204c91e36d9d367853cadc6c32e74f153";
                }
                part 'skill_skill-n' :> skills {
                    attribute :>> id = "skill-n";
                    attribute :>> source = "skills/skill-n/SKILL.md";
                    attribute :>> digest = "d44935251e7f132ee5753b8cb6ab7e52e3967b84e5c480e330509c84ba2ee470";
                }
                part 'skill_skill-o' :> skills {
                    attribute :>> id = "skill-o";
                    attribute :>> source = "skills/skill-o/SKILL.md";
                    attribute :>> digest = "2efedf9402b6a469005ead7eb54a7e8cae9225d5bd8156b13b922d8cf0390697";
                }
                part 'skill_skill-p' :> skills {
                    attribute :>> id = "skill-p";
                    attribute :>> source = "skills/skill-p/SKILL.md";
                    attribute :>> digest = "0fa975fc95416d9e9f8597fe600902af63fe61f2cbacbdbfd91110cf87349ffb";
                }
                part 'skill_skill-q' :> skills {
                    attribute :>> id = "skill-q";
                    attribute :>> source = "skills/skill-q/SKILL.md";
                    attribute :>> digest = "bb6961f39ac7bc96f6125193469a6f492e6fde2ae75c9c501cd23da35f78ea5a";
                }
                part 'skill_skill-r' :> skills {
                    attribute :>> id = "skill-r";
                    attribute :>> source = "skills/skill-r/SKILL.md";
                    attribute :>> digest = "7392a241c07a1903027a0b4eb0ee777dd33b1929874547e15af65abc1930276f";
                }
                part 'skill_skill-s' :> skills {
                    attribute :>> id = "skill-s";
                    attribute :>> source = "skills/skill-s/SKILL.md";
                    attribute :>> digest = "13132b65ca431a04a02e833b6dcadef60201b518dd2f2bf519c5b79fad2388d2";
                }
                part 'skill_skill-t' :> skills {
                    attribute :>> id = "skill-t";
                    attribute :>> source = "skills/skill-t/SKILL.md";
                    attribute :>> digest = "4dc4d3872a53d8881c487e88324e3c250e6b3b5fea4d9687a69cb4d048568efe";
                }
                part 'skill_skill-u' :> skills {
                    attribute :>> id = "skill-u";
                    attribute :>> source = "skills/skill-u/SKILL.md";
                    attribute :>> digest = "7ed3e153fc5cd1aac6dabf4b044922641c673dd7a393f20745002f94d66e8ec7";
                }
                part 'skill_skill-v' :> skills {
                    attribute :>> id = "skill-v";
                    attribute :>> source = "skills/skill-v/SKILL.md";
                    attribute :>> digest = "26641101dedf0c403b585c08105e051bf1e2eaa3ead627d03d18b9ad01abd4e7";
                }
                part 'skill_skill-w' :> skills {
                    attribute :>> id = "skill-w";
                    attribute :>> source = "skills/skill-w/SKILL.md";
                    attribute :>> digest = "13039487b0c3a43c9fddf066738b54522c3cca19d3d4931e7ef8dcd467b4637f";
                }
                part :>> memory {
                    attribute :>> searchEnabled = true;
                    attribute :>> searchProvider = "local";
                    attribute :>> searchFallback = "none";
                    attribute :>> searchSources = "[\"memory\"]";
                    attribute :>> extraPathCount = 0;
                    attribute :>> multimodal = false;
                    attribute :>> curatedSha256 = "b5f5a6329599f58b01306d855af8b198f425af2f7bf2e6cb0c57caaa9784eb23";
                    attribute :>> curatedBytes = 83;
                    attribute :>> dailyCount = 2;
                    attribute :>> dailyFirstDate = "2026-06-01";
                    attribute :>> dailyLastDate = "2026-06-02";
                    attribute :>> dailyBytes = 32;
                    attribute :>> dailySha256 = "fff8b2bf3669aa98b4fccab9de17d486d49f3bf68bc51fedce99802e66e7d9d5";
                    attribute :>> otherCount = 2;
                }
            }
            part sandbox : Sandbox {
                attribute :>> mode = "off";
                attribute :>> workspaceAccess = "none";
                attribute :>> image = "openclaw-sandbox:bookworm-slim";
                attribute :>> readOnlyRoot = true;
                attribute :>> network = "none";
                attribute :>> bindCount = 0;
                attribute :>> bindModes = "[]";
                attribute :>> environmentNames = "[\"OAUTH_BROKER_SECRET_KEY\",\"READER_API_KEY\",\"SEARCH_API_KEY\"]";
            }
            part execution : ExecutionPosture {
                attribute :>> host = "auto";
                attribute :>> security = "allowlist";
                attribute :>> ask = "on-miss";
                attribute :>> elevated = true;
                attribute :>> elevatedChannelsCount = 1;
                attribute :>> safeBins = "[\"jq\",\"python3\",\"wc\"]";
                attribute :>> safeBinProfiles = "[\"wc\"]";
                attribute :>> trustedDirCount = 1;
                attribute :>> pathPrependCount = 1;
                attribute :>> strictInlineEval = false;
                attribute :>> approvalSecurity = "allowlist";
                attribute :>> approvalAsk = "on-miss";
                attribute :>> effectiveSecurity = "allowlist";
                attribute :>> effectiveAsk = "on-miss";
            }
        }
        part def Agent_secretary :> OpenClawAgent {
            attribute :>> id = "secretary";
            attribute :>> displayName = "Secretary";
            attribute :>> emoji = "🌸";
            attribute :>> primaryModel = "ollama/glm-5.1:cloud";
            attribute :>> fallbackModels = "[\"openai/gpt-5.5\"]";
            doc /* Sanitized OpenClaw tool policy provenance: {
  "agent": {
    "allow": null,
    "alsoAllow": [
      "message",
      "sessions_send",
      "sessions_list",
      "sessions_history"
    ],
    "deny": [
      "gateway",
      "process"
    ],
    "profile": null
  },
  "agentProvider": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  },
  "global": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": "full"
  },
  "provider": {
    "allow": null,
    "alsoAllow": [],
    "deny": [],
    "profile": null
  },
  "sandbox": {
    "allow": [
      "exec",
      "process",
      "read",
      "write",
      "edit",
      "apply_patch",
      "image",
      "sessions_list",
      "sessions_history",
      "sessions_send",
      "sessions_spawn",
      "subagents",
      "session_status",
      "message",
      "browser"
    ],
    "alsoAllow": [],
    "deny": [
      "canvas",
      "nodes",
      "gateway",
      "telegram",
      "discord",
      "irc",
      "googlechat",
      "slack",
      "signal",
      "imessage"
    ],
    "profile": null
  }
} */
            ref item 'grant_sandbox:browser' : ToolGrant = Authority::'grant_secretary:sandbox:browser';
            ref item 'grant_sandbox:edit' : ToolGrant = Authority::'grant_secretary:sandbox:edit';
            ref item 'grant_sandbox:exec' : ToolGrant = Authority::'grant_secretary:sandbox:exec';
            ref item 'grant_sandbox:image' : ToolGrant = Authority::'grant_secretary:sandbox:image';
            ref item 'grant_sandbox:message' : ToolGrant = Authority::'grant_secretary:sandbox:message';
            ref item 'grant_sandbox:read' : ToolGrant = Authority::'grant_secretary:sandbox:read';
            ref item 'grant_sandbox:session_status' : ToolGrant = Authority::'grant_secretary:sandbox:session_status';
            ref item 'grant_sandbox:sessions_history' : ToolGrant = Authority::'grant_secretary:sandbox:sessions_history';
            ref item 'grant_sandbox:sessions_list' : ToolGrant = Authority::'grant_secretary:sandbox:sessions_list';
            ref item 'grant_sandbox:sessions_send' : ToolGrant = Authority::'grant_secretary:sandbox:sessions_send';
            ref item 'grant_sandbox:sessions_spawn' : ToolGrant = Authority::'grant_secretary:sandbox:sessions_spawn';
            ref item 'grant_sandbox:subagents' : ToolGrant = Authority::'grant_secretary:sandbox:subagents';
            ref item 'grant_sandbox:write' : ToolGrant = Authority::'grant_secretary:sandbox:write';
            ref item 'grant_sandbox:cli:safe-bin:python3' : ToolGrant = Authority::'grant_secretary:sandbox:cli:safe-bin:python3';
            ref item 'grant_sandbox:cli:safe-bin:wc' : ToolGrant = Authority::'grant_secretary:sandbox:cli:safe-bin:wc';
        }
        part agent_secretary : Agent_secretary {
            part :>> context {
                part 'file_AGENTS.md' :> instructions {
                    attribute :>> path = "AGENTS.md";
                    attribute :>> sha256 = "b950438849e5142c35fa7ebc87aa7e9b154aa0a0c84712d947359af840112b29";
                    attribute :>> bytes = 83;
                }
                part 'file_BOOTSTRAP.md' :> instructions {
                    attribute :>> path = "BOOTSTRAP.md";
                    attribute :>> sha256 = "c3e3b31f76d82daf06e19e85dcc8953892c4c2aaa27fb8f7c21095dd42f98298";
                    attribute :>> bytes = 86;
                }
                part 'file_HEARTBEAT.md' :> instructions {
                    attribute :>> path = "HEARTBEAT.md";
                    attribute :>> sha256 = "83975abb7223dec0054d67f8d598cfe88daf98c6dc231f03c213bb8090da7453";
                    attribute :>> bytes = 86;
                }
                part 'file_IDENTITY.md' :> instructions {
                    attribute :>> path = "IDENTITY.md";
                    attribute :>> sha256 = "80b668ffd828e5b38866bc71b054cf86b71516fbb443a29ec0e0ea5147333999";
                    attribute :>> bytes = 85;
                }
                part 'file_MEMORY.md' :> instructions {
                    attribute :>> path = "MEMORY.md";
                    attribute :>> sha256 = "b5f5a6329599f58b01306d855af8b198f425af2f7bf2e6cb0c57caaa9784eb23";
                    attribute :>> bytes = 83;
                }
                part 'file_SOUL.md' :> instructions {
                    attribute :>> path = "SOUL.md";
                    attribute :>> sha256 = "eec7dd6bb4b9514528af8afe47695e76451a4385900eb969404fd3e0fa310add";
                    attribute :>> bytes = 81;
                }
                part 'file_TOOLS.md' :> instructions {
                    attribute :>> path = "TOOLS.md";
                    attribute :>> sha256 = "c2f6e3ec23572457356b96fb1391dccab8332dacc75520712d370f8e18bf61ea";
                    attribute :>> bytes = 82;
                }
                part 'file_USER.md' :> instructions {
                    attribute :>> path = "USER.md";
                    attribute :>> sha256 = "4095ca5c455b82bfc396032f8ac37eb187d395c6d87a83ccca0a32361e688d92";
                    attribute :>> bytes = 81;
                }
                part skill_escalation :> skills {
                    attribute :>> id = "escalation";
                    attribute :>> source = "skills/escalation/SKILL.md";
                    attribute :>> digest = "9016653f64a19a21a650b2e4f3a595367ffb58e08c62b7c16fcb4380e73a5237";
                }
                part 'skill_skill-aa' :> skills {
                    attribute :>> id = "skill-aa";
                    attribute :>> source = "skills/skill-aa/SKILL.md";
                    attribute :>> digest = "9558fb7feb3129b48fc78e76ca037a97ec0b5a0ab8ae851ca4ee74b59aa6fa7b";
                }
                part 'skill_skill-af' :> skills {
                    attribute :>> id = "skill-af";
                    attribute :>> source = "skills/skill-af/SKILL.md";
                    attribute :>> digest = "ac6f6b333cb367edf8ff0fd0539b42937d0017b46853df851bcdbc8bbde90e85";
                }
                part 'skill_skill-o' :> skills {
                    attribute :>> id = "skill-o";
                    attribute :>> source = "skills/skill-o/SKILL.md";
                    attribute :>> digest = "2efedf9402b6a469005ead7eb54a7e8cae9225d5bd8156b13b922d8cf0390697";
                }
                part 'skill_skill-w' :> skills {
                    attribute :>> id = "skill-w";
                    attribute :>> source = "skills/skill-w/SKILL.md";
                    attribute :>> digest = "13039487b0c3a43c9fddf066738b54522c3cca19d3d4931e7ef8dcd467b4637f";
                }
                part :>> memory {
                    attribute :>> searchEnabled = true;
                    attribute :>> searchProvider = "local";
                    attribute :>> searchFallback = "none";
                    attribute :>> searchSources = "[\"memory\"]";
                    attribute :>> extraPathCount = 0;
                    attribute :>> multimodal = false;
                    attribute :>> curatedSha256 = "b5f5a6329599f58b01306d855af8b198f425af2f7bf2e6cb0c57caaa9784eb23";
                    attribute :>> curatedBytes = 83;
                    attribute :>> dailyCount = 0;
                    attribute :>> dailyBytes = 0;
                    attribute :>> otherCount = 0;
                }
            }
            part sandbox : Sandbox {
                attribute :>> mode = "all";
                attribute :>> scope = "agent";
                attribute :>> workspaceAccess = "rw";
                attribute :>> image = "openclaw-sandbox:bookworm-slim";
                attribute :>> readOnlyRoot = true;
                attribute :>> network = "bridge";
                attribute :>> memory = "1536m";
                attribute :>> cpus = 2;
                attribute :>> bindCount = 1;
                attribute :>> bindModes = "[\"rw\"]";
                attribute :>> environmentNames = "[\"GATEWAY_HOST\",\"GATEWAY_PORT\",\"HOOKS_TOKEN\",\"OAUTH_BROKER_SECRET_KEY\",\"OPENAI_API_KEY\",\"READER_API_KEY\",\"SEARCH_API_KEY\"]";
            }
            part execution : ExecutionPosture {
                attribute :>> host = "auto";
                attribute :>> security = "full";
                attribute :>> ask = "off";
                attribute :>> elevated = true;
                attribute :>> elevatedChannelsCount = 1;
                attribute :>> safeBins = "[\"jq\",\"python3\",\"wc\"]";
                attribute :>> safeBinProfiles = "[\"wc\"]";
                attribute :>> trustedDirCount = 1;
                attribute :>> pathPrependCount = 1;
                attribute :>> strictInlineEval = false;
                attribute :>> approvalSecurity = "allowlist";
                attribute :>> approvalAsk = "on-miss";
                attribute :>> effectiveSecurity = "allowlist";
                attribute :>> effectiveAsk = "on-miss";
            }
        }
        part provider_google : ModelProvider {
            attribute :>> name = "google";
            attribute :>> modelIds = "[\"gemini-3-pro-image-preview\"]";
        }
        part provider_ollama : ModelProvider {
            attribute :>> name = "ollama";
            attribute :>> apiKind = "ollama";
            attribute :>> modelIds = "[\"glm-5.1:cloud\",\"nemotron-3-super:cloud\"]";
        }
    }
    package Tools {
        doc /* One catalog of every granted tool, by origin (built-in, plugin, MCP, CLI). Plugins and MCP servers are providers. */
        part toolCatalog : ToolCatalog {
            part tool_agents_list :> tools {
                attribute :>> toolId = "agents_list";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_canvas :> tools {
                attribute :>> toolId = "canvas";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_code_execution :> tools {
                attribute :>> toolId = "code_execution";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_cron :> tools {
                attribute :>> toolId = "cron";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_edit :> tools {
                attribute :>> toolId = "edit";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_exec :> tools {
                attribute :>> toolId = "exec";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_gateway :> tools {
                attribute :>> toolId = "gateway";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_heartbeat_respond :> tools {
                attribute :>> toolId = "heartbeat_respond";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_image :> tools {
                attribute :>> toolId = "image";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_image_generate :> tools {
                attribute :>> toolId = "image_generate";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_message :> tools {
                attribute :>> toolId = "message";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_music_generate :> tools {
                attribute :>> toolId = "music_generate";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_nodes :> tools {
                attribute :>> toolId = "nodes";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_pdf :> tools {
                attribute :>> toolId = "pdf";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_process :> tools {
                attribute :>> toolId = "process";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_read :> tools {
                attribute :>> toolId = "read";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_session_status :> tools {
                attribute :>> toolId = "session_status";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_sessions_history :> tools {
                attribute :>> toolId = "sessions_history";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_sessions_list :> tools {
                attribute :>> toolId = "sessions_list";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_sessions_send :> tools {
                attribute :>> toolId = "sessions_send";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_sessions_spawn :> tools {
                attribute :>> toolId = "sessions_spawn";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_sessions_yield :> tools {
                attribute :>> toolId = "sessions_yield";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_skill_workshop :> tools {
                attribute :>> toolId = "skill_workshop";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_subagents :> tools {
                attribute :>> toolId = "subagents";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_tts :> tools {
                attribute :>> toolId = "tts";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_update_plan :> tools {
                attribute :>> toolId = "update_plan";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_video_generate :> tools {
                attribute :>> toolId = "video_generate";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_web_fetch :> tools {
                attribute :>> toolId = "web_fetch";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_web_search :> tools {
                attribute :>> toolId = "web_search";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_write :> tools {
                attribute :>> toolId = "write";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_x_search :> tools {
                attribute :>> toolId = "x_search";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
            part tool_browser :> tools {
                attribute :>> toolId = "browser";
                attribute :>> origin = ToolOrigin::plugin;
                attribute :>> provider = "browser";
                attribute :>> optional = false;
            }
            part tool_memory_get :> tools {
                attribute :>> toolId = "memory_get";
                attribute :>> origin = ToolOrigin::plugin;
                attribute :>> provider = "memory-core";
                attribute :>> optional = false;
            }
            part tool_memory_search :> tools {
                attribute :>> toolId = "memory_search";
                attribute :>> origin = ToolOrigin::plugin;
                attribute :>> provider = "memory-core";
                attribute :>> optional = false;
            }
            part tool_stock_quote :> tools {
                attribute :>> toolId = "stock_quote";
                attribute :>> origin = ToolOrigin::plugin;
                attribute :>> provider = "stock-quotes";
                attribute :>> optional = false;
            }
            part tool_whatsapp_login :> tools {
                attribute :>> toolId = "whatsapp_login";
                attribute :>> origin = ToolOrigin::plugin;
                attribute :>> provider = "whatsapp";
                attribute :>> optional = true;
            }
            part 'tool_docs__*' :> tools {
                attribute :>> toolId = "docs__*";
                attribute :>> origin = ToolOrigin::mcp;
                attribute :>> provider = "docs";
                attribute :>> optional = false;
            }
            part 'tool_outlook-graph__*' :> tools {
                attribute :>> toolId = "outlook-graph__*";
                attribute :>> origin = ToolOrigin::mcp;
                attribute :>> provider = "Outlook Graph";
                attribute :>> optional = false;
            }
            part 'tool_cli:git' :> tools {
                attribute :>> toolId = "git";
                attribute :>> origin = ToolOrigin::cli;
                attribute :>> provider = "exec";
                attribute :>> optional = false;
            }
            part 'tool_cli:python3' :> tools {
                attribute :>> toolId = "python3";
                attribute :>> origin = ToolOrigin::cli;
                attribute :>> provider = "exec";
                attribute :>> optional = false;
            }
            part 'tool_cli:rg' :> tools {
                attribute :>> toolId = "rg";
                attribute :>> origin = ToolOrigin::cli;
                attribute :>> provider = "exec";
                attribute :>> optional = false;
            }
            part 'tool_cli:wc' :> tools {
                attribute :>> toolId = "wc";
                attribute :>> origin = ToolOrigin::cli;
                attribute :>> provider = "exec";
                attribute :>> optional = false;
            }
        }
        part plugin_browser : OpenClawPlugin {
            attribute :>> pluginId = "browser";
            attribute :>> enabled = true;
            attribute :>> tools = "[\"browser\"]";
            attribute :>> optionalTools = "[]";
            attribute :>> toolProfiles = "[]";
        }
        part 'plugin_memory-core' : OpenClawPlugin {
            attribute :>> pluginId = "memory-core";
            attribute :>> enabled = true;
            attribute :>> tools = "[\"memory_get\",\"memory_search\"]";
            attribute :>> optionalTools = "[]";
            attribute :>> toolProfiles = "[]";
        }
        part 'plugin_stock-quotes' : OpenClawPlugin {
            attribute :>> pluginId = "stock-quotes";
            attribute :>> enabled = true;
            attribute :>> tools = "[\"stock_quote\"]";
            attribute :>> optionalTools = "[]";
            attribute :>> toolProfiles = "[{\"id\":\"stock_quote\",\"profiles\":[\"coding\"]}]";
        }
        part plugin_whatsapp : OpenClawPlugin {
            attribute :>> pluginId = "whatsapp";
            attribute :>> enabled = true;
            attribute :>> tools = "[\"whatsapp_login\"]";
            attribute :>> optionalTools = "[\"whatsapp_login\"]";
            attribute :>> toolProfiles = "[]";
        }
        part plugin_workboard : OpenClawPlugin {
            attribute :>> pluginId = "workboard";
            attribute :>> enabled = false;
            attribute :>> tools = "[\"board_claim\",\"board_list\"]";
            attribute :>> optionalTools = "[\"board_claim\",\"board_list\"]";
            attribute :>> toolProfiles = "[]";
        }
        part mcp_9tools : McpServer {
            attribute :>> serverId = "9tools";
            attribute :>> toolPrefix = "mcp-9tools";
            attribute :>> enabled = false;
            attribute :>> transport = "sse";
            attribute :>> oauth = false;
            attribute :>> toolInclude = "[]";
            attribute :>> toolExclude = "[]";
            attribute :>> envNames = "[]";
            attribute :>> headerNames = "[]";
            attribute :>> argCount = 0;
        }
        part 'mcp_Outlook Graph' : McpServer {
            attribute :>> serverId = "Outlook Graph";
            attribute :>> toolPrefix = "outlook-graph";
            attribute :>> enabled = true;
            attribute :>> transport = "streamable-http";
            attribute :>> oauth = true;
            attribute :>> oauthIdentity = "per-requester";
            attribute :>> toolInclude = "[]";
            attribute :>> toolExclude = "[]";
            attribute :>> envNames = "[]";
            attribute :>> headerNames = "[\"Authorization\"]";
            attribute :>> argCount = 0;
        }
        part mcp_docs : McpServer {
            attribute :>> serverId = "docs";
            attribute :>> toolPrefix = "docs";
            attribute :>> enabled = true;
            attribute :>> transport = "stdio";
            attribute :>> oauth = false;
            attribute :>> toolInclude = "[\"search_*\"]";
            attribute :>> toolExclude = "[]";
            attribute :>> envNames = "[\"DOCS_TOKEN\"]";
            attribute :>> headerNames = "[]";
            attribute :>> argCount = 2;
        }
    }
    package Context {
        doc /* Instance-wide context: bundled skill entries and the memory backend. Each agent's instructions, skills and memory are in its context. */
        part bundled_1password : BundledSkill {
            attribute :>> name = "1password";
            attribute :>> enabled = false;
        }
        part bundled_blogwatcher : BundledSkill {
            attribute :>> name = "blogwatcher";
            attribute :>> enabled = false;
        }
        part bundled_blucli : BundledSkill {
            attribute :>> name = "blucli";
            attribute :>> enabled = false;
        }
        part bundled_camsnap : BundledSkill {
            attribute :>> name = "camsnap";
            attribute :>> enabled = false;
        }
        part 'bundled_coding-agent' : BundledSkill {
            attribute :>> name = "coding-agent";
            attribute :>> enabled = false;
        }
        part bundled_discord : BundledSkill {
            attribute :>> name = "discord";
            attribute :>> enabled = false;
        }
        part bundled_eightctl : BundledSkill {
            attribute :>> name = "eightctl";
            attribute :>> enabled = false;
        }
        part bundled_gemini : BundledSkill {
            attribute :>> name = "gemini";
            attribute :>> enabled = false;
        }
        part bundled_gifgrep : BundledSkill {
            attribute :>> name = "gifgrep";
            attribute :>> enabled = false;
        }
        part bundled_github : BundledSkill {
            attribute :>> name = "github";
            attribute :>> enabled = true;
        }
        part bundled_goplaces : BundledSkill {
            attribute :>> name = "goplaces";
            attribute :>> enabled = false;
        }
        part bundled_healthcheck : BundledSkill {
            attribute :>> name = "healthcheck";
            attribute :>> enabled = true;
        }
        part bundled_himalaya : BundledSkill {
            attribute :>> name = "himalaya";
            attribute :>> enabled = false;
        }
        part bundled_mcporter : BundledSkill {
            attribute :>> name = "mcporter";
            attribute :>> enabled = false;
        }
        part 'bundled_model-usage' : BundledSkill {
            attribute :>> name = "model-usage";
            attribute :>> enabled = true;
        }
        part 'bundled_nano-pdf' : BundledSkill {
            attribute :>> name = "nano-pdf";
            attribute :>> enabled = false;
        }
        part bundled_obsidian : BundledSkill {
            attribute :>> name = "obsidian";
            attribute :>> enabled = false;
        }
        part 'bundled_openai-whisper' : BundledSkill {
            attribute :>> name = "openai-whisper";
            attribute :>> enabled = false;
        }
        part bundled_openhue : BundledSkill {
            attribute :>> name = "openhue";
            attribute :>> enabled = false;
        }
        part bundled_oracle : BundledSkill {
            attribute :>> name = "oracle";
            attribute :>> enabled = false;
        }
        part bundled_ordercli : BundledSkill {
            attribute :>> name = "ordercli";
            attribute :>> enabled = false;
        }
        part bundled_sag : BundledSkill {
            attribute :>> name = "sag";
            attribute :>> enabled = false;
        }
        part 'bundled_session-logs' : BundledSkill {
            attribute :>> name = "session-logs";
            attribute :>> enabled = true;
        }
        part 'bundled_sherpa-onnx-tts' : BundledSkill {
            attribute :>> name = "sherpa-onnx-tts";
            attribute :>> enabled = false;
        }
        part 'bundled_skill-creator' : BundledSkill {
            attribute :>> name = "skill-creator";
            attribute :>> enabled = true;
        }
        part bundled_slack : BundledSkill {
            attribute :>> name = "slack";
            attribute :>> enabled = false;
        }
        part bundled_songsee : BundledSkill {
            attribute :>> name = "songsee";
            attribute :>> enabled = false;
        }
        part bundled_sonoscli : BundledSkill {
            attribute :>> name = "sonoscli";
            attribute :>> enabled = false;
        }
        part 'bundled_spotify-player' : BundledSkill {
            attribute :>> name = "spotify-player";
            attribute :>> enabled = false;
        }
        part bundled_summarize : BundledSkill {
            attribute :>> name = "summarize";
            attribute :>> enabled = false;
        }
        part bundled_trello : BundledSkill {
            attribute :>> name = "trello";
            attribute :>> enabled = false;
        }
        part 'bundled_voice-call' : BundledSkill {
            attribute :>> name = "voice-call";
            attribute :>> enabled = false;
        }
        part bundled_wacli : BundledSkill {
            attribute :>> name = "wacli";
            attribute :>> enabled = false;
        }
        part bundled_xurl : BundledSkill {
            attribute :>> name = "xurl";
            attribute :>> enabled = false;
        }
        part memoryBackend : MemoryBackend {
            attribute :>> dreamingEnabled = true;
            attribute :>> dreamingFrequency = "0 3 * * *";
            attribute :>> activeMemoryEnabled = true;
            attribute :>> activeMemoryAgents = "[\"lead\"]";
            attribute :>> activeMemoryChatTypes = "[\"direct\"]";
            attribute :>> persistTranscripts = false;
        }
    }
    package Cases {
        doc /* Cron jobs and heartbeats as scheduled cases. */
        part heartbeat_lead : ScheduledCase {
            attribute :>> id = "heartbeat:lead";
            attribute :>> displayName = "Heartbeat lead";
            attribute :>> enabled = true;
            attribute :>> targetAgent = "lead";
            attribute :>> envelope = AssemblyCases::EnvelopeKind::reassessment;
            ref part :>> owner = Operators::agent_lead;
            attribute :>> schedule : MillisecondEvery {
                attribute :>> durationMs = 1800000;
                attribute :>> count = 30;
                attribute :>> unit = AssemblyCases::ScheduleUnit::minute;
            }
        }
        part 'cron_job-1' : ScheduledCase {
            attribute :>> id = "job-1";
            attribute :>> displayName = "Daily digest";
            attribute :>> enabled = false;
            attribute :>> targetAgent = "main";
            attribute :>> envelope = AssemblyCases::EnvelopeKind::deterministic;
            attribute :>> schedule : CronSchedule {
                attribute :>> expression = "30 7 * * *";
                attribute :>> timezone = "America/New_York";
            }
            part file_prompt : InstructionFile {
                attribute :>> path = "state/openclaw.sqlite#cron_jobs/job-1/job_json/payload/message";
                attribute :>> sha256 = "94480fa29d6311f7834319e207ae665a9b26eb52a0a489080095a0647d9a8314";
                attribute :>> bytes = 15;
            }
        }
        part 'cron_job-10' : ScheduledCase {
            attribute :>> id = "job-10";
            attribute :>> displayName = "Weekly Retrospective";
            attribute :>> enabled = false;
            attribute :>> targetAgent = "lead";
            attribute :>> envelope = AssemblyCases::EnvelopeKind::deterministic;
            ref part :>> owner = Operators::agent_lead;
            attribute :>> schedule : CronSchedule {
                attribute :>> expression = "0 12 * * 4";
            }
            part file_prompt : InstructionFile {
                attribute :>> path = "state/openclaw.sqlite#cron_jobs/job-10/job_json/payload/message";
                attribute :>> sha256 = "76363c03d9ebc637ef9d41600ca9abfb25824bc8b2e5b32f7cfaca18385dd66e";
                attribute :>> bytes = 16;
            }
        }
        part 'cron_job-2' : ScheduledCase {
            attribute :>> id = "job-2";
            attribute :>> displayName = "Security check";
            attribute :>> enabled = false;
            attribute :>> targetAgent = "main";
            attribute :>> envelope = AssemblyCases::EnvelopeKind::deterministic;
            attribute :>> schedule : CronSchedule {
                attribute :>> expression = "0 6,12,18,0 * * *";
                attribute :>> timezone = "America/New_York";
            }
            part file_prompt : InstructionFile {
                attribute :>> path = "state/openclaw.sqlite#cron_jobs/job-2/job_json/payload/message";
                attribute :>> sha256 = "e71cf18990d2630d752caa32d26da513ad1e06e100855127254ea525e3e4fad0";
                attribute :>> bytes = 15;
            }
        }
        part 'cron_job-3' : ScheduledCase {
            attribute :>> id = "job-3";
            attribute :>> displayName = "process-leads";
            attribute :>> enabled = false;
            attribute :>> targetAgent = "main";
            attribute :>> envelope = AssemblyCases::EnvelopeKind::deterministic;
            attribute :>> schedule : CronSchedule {
                attribute :>> expression = "0 9 * * *";
                attribute :>> timezone = "Europe/Paris";
            }
            part file_prompt : InstructionFile {
                attribute :>> path = "state/openclaw.sqlite#cron_jobs/job-3/job_json/payload/message";
                attribute :>> sha256 = "2293c41222dd2e0d7bd76a075685a7ce73c07602f4743a3764edf138c271885c";
                attribute :>> bytes = 15;
            }
        }
        part 'cron_job-4' : ScheduledCase {
            attribute :>> id = "job-4";
            attribute :>> displayName = "Daily analytics report";
            attribute :>> enabled = false;
            attribute :>> targetAgent = "main";
            attribute :>> envelope = AssemblyCases::EnvelopeKind::deterministic;
            attribute :>> schedule : CronSchedule {
                attribute :>> expression = "0 8 * * *";
                attribute :>> timezone = "Europe/Paris";
            }
            part file_prompt : InstructionFile {
                attribute :>> path = "state/openclaw.sqlite#cron_jobs/job-4/job_json/payload/message";
                attribute :>> sha256 = "9029c33f8ca5c17545657eb22f461aba46e52251bfc60c36cc3f3f1c4f5e1dcb";
                attribute :>> bytes = 15;
            }
        }
        part 'cron_job-5' : ScheduledCase {
            attribute :>> id = "job-5";
            attribute :>> displayName = "Weekly scouting A";
            attribute :>> enabled = false;
            attribute :>> targetAgent = "main";
            attribute :>> envelope = AssemblyCases::EnvelopeKind::deterministic;
            attribute :>> schedule : CronSchedule {
                attribute :>> expression = "0 1 * * 2,5";
                attribute :>> timezone = "UTC";
            }
            part file_prompt : InstructionFile {
                attribute :>> path = "state/openclaw.sqlite#cron_jobs/job-5/job_json/payload/message";
                attribute :>> sha256 = "4f8e21fb826bb015c25a1df356f54c7e4c0125b6f01679c36c3d9e9737038bba";
                attribute :>> bytes = 15;
            }
        }
        part 'cron_job-6' : ScheduledCase {
            attribute :>> id = "job-6";
            attribute :>> displayName = "Weekly scouting B";
            attribute :>> enabled = false;
            attribute :>> targetAgent = "main";
            attribute :>> envelope = AssemblyCases::EnvelopeKind::deterministic;
            attribute :>> schedule : CronSchedule {
                attribute :>> expression = "0 2 * * 1,4";
                attribute :>> timezone = "UTC";
            }
            part file_prompt : InstructionFile {
                attribute :>> path = "state/openclaw.sqlite#cron_jobs/job-6/job_json/payload/message";
                attribute :>> sha256 = "efb652d4a2b0feb8593e52b2e8973f2f8b6c6e777514cb93e50fd0a6856f2fdf";
                attribute :>> bytes = 15;
            }
        }
        part 'cron_job-7' : ScheduledCase {
            attribute :>> id = "job-7";
            attribute :>> displayName = "field-usage-daily";
            attribute :>> enabled = false;
            attribute :>> targetAgent = "lead";
            attribute :>> envelope = AssemblyCases::EnvelopeKind::deterministic;
            ref part :>> owner = Operators::agent_lead;
            attribute :>> schedule : CronSchedule {
                attribute :>> expression = "0 22 * * *";
                attribute :>> timezone = "UTC";
            }
            part file_prompt : InstructionFile {
                attribute :>> path = "state/openclaw.sqlite#cron_jobs/job-7/job_json/payload/message";
                attribute :>> sha256 = "051ccd4da86981fea5f36459f6f7e922f200cb156531f0d1b4988daae23cac91";
                attribute :>> bytes = 15;
            }
        }
        part 'cron_job-8' : ScheduledCase {
            attribute :>> id = "job-8";
            attribute :>> displayName = "field-usage-alert";
            attribute :>> enabled = false;
            attribute :>> targetAgent = "lead";
            attribute :>> envelope = AssemblyCases::EnvelopeKind::deterministic;
            ref part :>> owner = Operators::agent_lead;
            attribute :>> schedule : MillisecondEvery {
                attribute :>> durationMs = 3600000;
                attribute :>> count = 60;
                attribute :>> unit = AssemblyCases::ScheduleUnit::minute;
            }
            part file_prompt : InstructionFile {
                attribute :>> path = "state/openclaw.sqlite#cron_jobs/job-8/job_json/payload/message";
                attribute :>> sha256 = "5b2d6d4c42f111ebdf129558498501f3a47d6ac9248ba05e4df5e1943d597b2d";
                attribute :>> bytes = 15;
            }
        }
        part 'cron_job-9' : ScheduledCase {
            attribute :>> id = "job-9";
            attribute :>> displayName = "Daily marketing report";
            attribute :>> enabled = false;
            attribute :>> targetAgent = "lead";
            attribute :>> envelope = AssemblyCases::EnvelopeKind::deterministic;
            ref part :>> owner = Operators::agent_lead;
            attribute :>> schedule : CronSchedule {
                attribute :>> expression = "0 8 * * *";
                attribute :>> timezone = "Europe/Paris";
            }
            part file_prompt : InstructionFile {
                attribute :>> path = "state/openclaw.sqlite#cron_jobs/job-9/job_json/payload/message";
                attribute :>> sha256 = "e26143239af944d7daa23f2272320cc1b86e9dae7596d219e2125bde84bfd556";
                attribute :>> bytes = 16;
            }
        }
    }
    package Entries {
        doc /* Channel accounts, the agents bound to them, and hooks. */
        part 'account_discord:default' : ChannelAccount {
            attribute :>> channel = "discord";
            attribute :>> accountId = "default";
            attribute :>> enabled = true;
            attribute :>> dmPolicy = "allowlist";
            attribute :>> groupPolicy = "allowlist";
        }
        part 'account_discord:sandbox' : ChannelAccount {
            attribute :>> channel = "discord";
            attribute :>> accountId = "sandbox";
            attribute :>> enabled = true;
            attribute :>> dmPolicy = "disabled";
            attribute :>> groupPolicy = "allowlist";
        }
        part 'account_telegram:default' : ChannelAccount {
            attribute :>> channel = "telegram";
            attribute :>> accountId = "default";
            attribute :>> enabled = true;
            attribute :>> dmPolicy = "pairing";
            attribute :>> groupPolicy = "allowlist";
        }
        part 'account_telegram:field' : ChannelAccount {
            attribute :>> channel = "telegram";
            attribute :>> accountId = "field";
            attribute :>> enabled = true;
            attribute :>> dmPolicy = "pairing";
            attribute :>> groupPolicy = "allowlist";
        }
        part 'account_telegram:lead' : ChannelAccount {
            attribute :>> channel = "telegram";
            attribute :>> accountId = "lead";
            attribute :>> enabled = true;
            attribute :>> dmPolicy = "pairing";
            attribute :>> groupPolicy = "allowlist";
        }
        part 'account_whatsapp:coaching' : ChannelAccount {
            attribute :>> channel = "whatsapp";
            attribute :>> accountId = "coaching";
            attribute :>> enabled = true;
            attribute :>> dmPolicy = "allowlist";
            attribute :>> groupPolicy = "allowlist";
        }
        part 'account_whatsapp:default' : ChannelAccount {
            attribute :>> channel = "whatsapp";
            attribute :>> accountId = "default";
            attribute :>> enabled = true;
            attribute :>> dmPolicy = "allowlist";
            attribute :>> groupPolicy = "allowlist";
        }
        part 'account_whatsapp:devbox' : ChannelAccount {
            attribute :>> channel = "whatsapp";
            attribute :>> accountId = "devbox";
            attribute :>> enabled = false;
            attribute :>> dmPolicy = "allowlist";
            attribute :>> groupPolicy = "allowlist";
        }
        part 'account_whatsapp:field' : ChannelAccount {
            attribute :>> channel = "whatsapp";
            attribute :>> accountId = "field";
            attribute :>> enabled = true;
            attribute :>> dmPolicy = "allowlist";
            attribute :>> groupPolicy = "allowlist";
        }
        part 'account_whatsapp:secretary' : ChannelAccount {
            attribute :>> channel = "whatsapp";
            attribute :>> accountId = "secretary";
            attribute :>> enabled = true;
            attribute :>> dmPolicy = "allowlist";
            attribute :>> groupPolicy = "allowlist";
        }
        connection 'binding_binding-1b6d7fadd02512869b66-7' : AgentBinding connect Operators::agent_field to 'account_telegram:field' {
        }
        connection 'binding_binding-40a6ca9891072b8f0537-5' : AgentBinding connect Operators::agent_client to 'account_whatsapp:coaching' {
            attribute :>> peerKind = "direct";
        }
        connection 'binding_binding-449f56fb335550499a13-4' : AgentBinding connect Operators::agent_coach to 'account_whatsapp:coaching' {
            attribute :>> peerKind = "direct";
        }
        connection 'binding_binding-765daf766d61288f0dff-6' : AgentBinding connect Operators::agent_lead to 'account_telegram:lead' {
        }
        connection 'binding_binding-7e4892419c5b7145ad50-8' : AgentBinding connect Operators::agent_devbox to 'account_whatsapp:devbox' {
        }
        connection 'binding_binding-7ea0ec7db3778bcb9435-1' : AgentBinding connect Operators::agent_secretary to 'account_whatsapp:secretary' {
            attribute :>> peerKind = "direct";
        }
        connection 'binding_binding-c98dcabd536f3e6fb436-2' : AgentBinding connect Operators::agent_lead to 'account_discord:default' {
        }
        connection 'binding_binding-f06f0d0d3698fe4a4a98-0' : AgentBinding connect Operators::agent_field to 'account_whatsapp:field' {
            attribute :>> peerKind = "direct";
        }
        connection 'binding_binding-f302b80e62a7fbb9fcfa-3' : AgentBinding connect Operators::agent_devbox to 'account_discord:sandbox' {
        }
        part 'hook_hook-0' : ExternalTrigger {
            attribute :>> name = "Webhook";
            attribute :>> targetAgent = "lead";
            attribute :>> deliveryChannel = "whatsapp";
            part file_template : InstructionFile {
                attribute :>> path = "openclaw.json#/hooks/mappings/0/messageTemplate";
                attribute :>> sha256 = "b7b734e170d526bd7f9599afa6eb09455078aeff359e068360fab35e9578fdc5";
                attribute :>> bytes = 15;
            }
        }
    }
    package Authority {
        doc /* Effective tool grants per agent and layer, delegation and agent-to-agent messaging rules, and host exec approvals. */
        item 'grant_client:sandbox:browser' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_browser;
            attribute :>> layer = "sandbox";
        }
        item 'grant_client:sandbox:edit' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_edit;
            attribute :>> layer = "sandbox";
        }
        item 'grant_client:sandbox:exec' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_exec;
            attribute :>> layer = "sandbox";
        }
        item 'grant_client:sandbox:image' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_image;
            attribute :>> layer = "sandbox";
        }
        item 'grant_client:sandbox:message' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_message;
            attribute :>> layer = "sandbox";
        }
        item 'grant_client:sandbox:read' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_read;
            attribute :>> layer = "sandbox";
        }
        item 'grant_client:sandbox:session_status' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_session_status;
            attribute :>> layer = "sandbox";
        }
        item 'grant_client:sandbox:sessions_history' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_history;
            attribute :>> layer = "sandbox";
        }
        item 'grant_client:sandbox:sessions_list' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_list;
            attribute :>> layer = "sandbox";
        }
        item 'grant_client:sandbox:sessions_send' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_send;
            attribute :>> layer = "sandbox";
        }
        item 'grant_client:sandbox:sessions_spawn' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_spawn;
            attribute :>> layer = "sandbox";
        }
        item 'grant_client:sandbox:subagents' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_subagents;
            attribute :>> layer = "sandbox";
        }
        item 'grant_client:sandbox:write' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_write;
            attribute :>> layer = "sandbox";
        }
        item 'grant_client:sandbox:cli:safe-bin:python3' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:python3';
            attribute :>> layer = "sandbox";
            attribute :>> commandKind = "safe-bin";
            attribute :>> argsRestricted = true;
        }
        item 'grant_client:sandbox:cli:safe-bin:wc' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:wc';
            attribute :>> layer = "sandbox";
            attribute :>> commandKind = "safe-bin";
            attribute :>> argsRestricted = true;
        }
        item 'grant_coach:sandbox:browser' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_browser;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:edit' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_edit;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:exec' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_exec;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:gateway' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_gateway;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:image' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_image;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:message' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_message;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:read' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_read;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:session_status' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_session_status;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:sessions_history' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_history;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:sessions_list' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_list;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:sessions_send' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_send;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:sessions_spawn' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_spawn;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:subagents' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_subagents;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:web_fetch' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_web_fetch;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:web_search' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_web_search;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:write' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_write;
            attribute :>> layer = "sandbox";
        }
        item 'grant_coach:sandbox:cli:safe-bin:python3' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:python3';
            attribute :>> layer = "sandbox";
            attribute :>> commandKind = "safe-bin";
            attribute :>> argsRestricted = true;
        }
        item 'grant_coach:sandbox:cli:safe-bin:wc' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:wc';
            attribute :>> layer = "sandbox";
            attribute :>> commandKind = "safe-bin";
            attribute :>> argsRestricted = true;
        }
        item 'grant_devbox:sandbox:browser' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_browser;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:edit' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_edit;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:exec' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_exec;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:image' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_image;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:message' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_message;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:read' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_read;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:session_status' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_session_status;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:sessions_history' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_history;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:sessions_list' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_list;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:sessions_send' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_send;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:sessions_spawn' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_spawn;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:subagents' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_subagents;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:web_fetch' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_web_fetch;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:web_search' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_web_search;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:write' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_write;
            attribute :>> layer = "sandbox";
        }
        item 'grant_devbox:sandbox:cli:safe-bin:python3' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:python3';
            attribute :>> layer = "sandbox";
            attribute :>> commandKind = "safe-bin";
            attribute :>> argsRestricted = true;
        }
        item 'grant_devbox:sandbox:cli:safe-bin:wc' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:wc';
            attribute :>> layer = "sandbox";
            attribute :>> commandKind = "safe-bin";
            attribute :>> argsRestricted = true;
        }
        item 'grant_field:sandbox:browser' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_browser;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:docs__*' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_docs__*';
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:edit' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_edit;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:exec' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_exec;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:image' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_image;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:message' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_message;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:pdf' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_pdf;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:read' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_read;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:session_status' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_session_status;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:sessions_history' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_history;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:sessions_list' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_list;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:sessions_send' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_send;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:sessions_spawn' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_spawn;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:subagents' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_subagents;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:tts' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_tts;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:write' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_write;
            attribute :>> layer = "sandbox";
        }
        item 'grant_field:sandbox:cli:safe-bin:python3' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:python3';
            attribute :>> layer = "sandbox";
            attribute :>> commandKind = "safe-bin";
            attribute :>> argsRestricted = true;
        }
        item 'grant_field:sandbox:cli:safe-bin:wc' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:wc';
            attribute :>> layer = "sandbox";
            attribute :>> commandKind = "safe-bin";
            attribute :>> argsRestricted = true;
        }
        item 'grant_lead:host:agents_list' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_agents_list;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:browser' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_browser;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:canvas' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_canvas;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:code_execution' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_code_execution;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:cron' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_cron;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:docs__*' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_docs__*';
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:edit' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_edit;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:exec' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_exec;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:gateway' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_gateway;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:heartbeat_respond' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_heartbeat_respond;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:image' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_image;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:image_generate' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_image_generate;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:memory_get' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_memory_get;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:memory_search' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_memory_search;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:message' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_message;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:music_generate' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_music_generate;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:nodes' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_nodes;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:outlook-graph__*' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_outlook-graph__*';
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:pdf' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_pdf;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:process' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_process;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:read' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_read;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:session_status' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_session_status;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:sessions_history' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_history;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:sessions_list' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_list;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:sessions_send' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_send;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:sessions_spawn' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_spawn;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:sessions_yield' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_yield;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:skill_workshop' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_skill_workshop;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:stock_quote' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_stock_quote;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:subagents' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_subagents;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:tts' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_tts;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:update_plan' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_update_plan;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:video_generate' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_video_generate;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:web_fetch' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_web_fetch;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:web_search' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_web_search;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:whatsapp_login' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_whatsapp_login;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:write' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_write;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:x_search' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_x_search;
            attribute :>> layer = "host";
        }
        item 'grant_lead:host:cli:name:rg' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:rg';
            attribute :>> layer = "host";
            attribute :>> commandKind = "name";
            attribute :>> argsRestricted = false;
        }
        item 'grant_lead:host:cli:path:git' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:git';
            attribute :>> layer = "host";
            attribute :>> commandKind = "path";
            attribute :>> argsRestricted = true;
        }
        item 'grant_lead:host:cli:safe-bin:python3' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:python3';
            attribute :>> layer = "host";
            attribute :>> commandKind = "safe-bin";
            attribute :>> argsRestricted = true;
        }
        item 'grant_lead:host:cli:safe-bin:wc' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:wc';
            attribute :>> layer = "host";
            attribute :>> commandKind = "safe-bin";
            attribute :>> argsRestricted = true;
        }
        item 'grant_secretary:sandbox:browser' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_browser;
            attribute :>> layer = "sandbox";
        }
        item 'grant_secretary:sandbox:edit' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_edit;
            attribute :>> layer = "sandbox";
        }
        item 'grant_secretary:sandbox:exec' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_exec;
            attribute :>> layer = "sandbox";
        }
        item 'grant_secretary:sandbox:image' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_image;
            attribute :>> layer = "sandbox";
        }
        item 'grant_secretary:sandbox:message' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_message;
            attribute :>> layer = "sandbox";
        }
        item 'grant_secretary:sandbox:read' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_read;
            attribute :>> layer = "sandbox";
        }
        item 'grant_secretary:sandbox:session_status' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_session_status;
            attribute :>> layer = "sandbox";
        }
        item 'grant_secretary:sandbox:sessions_history' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_history;
            attribute :>> layer = "sandbox";
        }
        item 'grant_secretary:sandbox:sessions_list' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_list;
            attribute :>> layer = "sandbox";
        }
        item 'grant_secretary:sandbox:sessions_send' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_send;
            attribute :>> layer = "sandbox";
        }
        item 'grant_secretary:sandbox:sessions_spawn' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_sessions_spawn;
            attribute :>> layer = "sandbox";
        }
        item 'grant_secretary:sandbox:subagents' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_subagents;
            attribute :>> layer = "sandbox";
        }
        item 'grant_secretary:sandbox:write' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_write;
            attribute :>> layer = "sandbox";
        }
        item 'grant_secretary:sandbox:cli:safe-bin:python3' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:python3';
            attribute :>> layer = "sandbox";
            attribute :>> commandKind = "safe-bin";
            attribute :>> argsRestricted = true;
        }
        item 'grant_secretary:sandbox:cli:safe-bin:wc' : ToolGrant {
            ref :>> tool = Tools::toolCatalog.'tool_cli:wc';
            attribute :>> layer = "sandbox";
            attribute :>> commandKind = "safe-bin";
            attribute :>> argsRestricted = true;
        }
        part 'delegation_client:coach' : DelegationRule {
            attribute :>> fromAgent = "client";
            attribute :>> toAgent = "coach";
        }
        part 'delegation_coach:client' : DelegationRule {
            attribute :>> fromAgent = "coach";
            attribute :>> toAgent = "client";
        }
        part 'delegation_devbox:lead' : DelegationRule {
            attribute :>> fromAgent = "devbox";
            attribute :>> toAgent = "lead";
        }
        part 'delegation_field:lead' : DelegationRule {
            attribute :>> fromAgent = "field";
            attribute :>> toAgent = "lead";
        }
        part 'delegation_lead:client' : DelegationRule {
            attribute :>> fromAgent = "lead";
            attribute :>> toAgent = "client";
        }
        part 'delegation_lead:coach' : DelegationRule {
            attribute :>> fromAgent = "lead";
            attribute :>> toAgent = "coach";
        }
        part 'delegation_lead:devbox' : DelegationRule {
            attribute :>> fromAgent = "lead";
            attribute :>> toAgent = "devbox";
        }
        part 'delegation_lead:field' : DelegationRule {
            attribute :>> fromAgent = "lead";
            attribute :>> toAgent = "field";
        }
        part 'delegation_lead:secretary' : DelegationRule {
            attribute :>> fromAgent = "lead";
            attribute :>> toAgent = "secretary";
        }
        part 'delegation_secretary:lead' : DelegationRule {
            attribute :>> fromAgent = "secretary";
            attribute :>> toAgent = "lead";
        }
        part messaging : MessagingPolicy {
            attribute :>> enabled = true;
            attribute :>> allowedTargets = "[\"*\"]";
        }
        part execApprovals : ExecApprovals {
            attribute :>> defaultSecurity = "allowlist";
            attribute :>> defaultAsk = "on-miss";
            attribute :>> askFallback = "deny";
            attribute :>> autoAllowSkills = false;
            attribute :>> wildcardCommands = "[{\"id\":\"path:*\",\"command\":\"*\",\"kind\":\"path\",\"argsRestricted\":false}]";
        }
    }
}
