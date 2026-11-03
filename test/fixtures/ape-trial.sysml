// Additive synthetic model for the APE trial; compile beside the regular export.
// Agent ids are orphan, self, parent, bridge and host. Expected structural cases:
// - unreachable operator: orphan and self have no external incoming path;
//   parent has a modeled case entry, bridge/host have incoming delegation;
// - delegation cycle: self -> self alone is excluded, as is the acyclic chain;
// - transitive host execution: parent and bridge reach host, the sole agent
//   granted builtin exec with gateway/full/off posture; orphan/self do not.
// Known targets are SysML references; '*' and unknown ids remain policy facts.
package ApeTrial {
    private import OpenClawImport::*;
    private import ScalarValues::*;

    package Operators {
        part def Agent_orphan :> OpenClawAgent {
            attribute :>> id = "orphan";
        }
        part agent_orphan : Agent_orphan;

        part def Agent_self :> OpenClawAgent {
            attribute :>> id = "self";
        }
        part agent_self : Agent_self;

        part def Agent_parent :> OpenClawAgent {
            attribute :>> id = "parent";
        }
        part agent_parent : Agent_parent;

        part def Agent_bridge :> OpenClawAgent {
            attribute :>> id = "bridge";
        }
        part agent_bridge : Agent_bridge;

        part def Agent_host :> OpenClawAgent {
            attribute :>> id = "host";
            ref item grant_exec : ToolGrant = Authority::grant_host_exec;
        }
        part agent_host : Agent_host {
            part execution : ExecutionPosture {
                attribute :>> host = "gateway";
                attribute :>> effectiveSecurity = "full";
                attribute :>> effectiveAsk = "off";
            }
        }
    }

    package Tools {
        part toolCatalog : ToolCatalog {
            part tool_exec :> tools {
                attribute :>> toolId = "exec";
                attribute :>> origin = ToolOrigin::builtin;
                attribute :>> optional = false;
            }
        }
    }

    package Cases {
        part parentEntry : ScheduledCase {
            attribute :>> id = "ape-trial-parent-entry";
            attribute :>> enabled = true;
            ref part :>> targetAgent = Operators::agent_parent;
            ref part :>> owner = Operators::agent_parent;
        }
    }

    package Authority {
        item grant_host_exec : ToolGrant {
            ref :>> tool = Tools::toolCatalog.tool_exec;
            attribute :>> layer = "host";
        }
        connection delegation_self_self : DelegationRule
            connect Operators::agent_self to Operators::agent_self;
        connection delegation_parent_bridge : DelegationRule
            connect Operators::agent_parent to Operators::agent_bridge;
        connection delegation_bridge_host : DelegationRule
            connect Operators::agent_bridge to Operators::agent_host;
        part delegationPolicy_parent : DelegationPolicy {
            ref part :>> fromAgent = Operators::agent_parent;
            attribute :>> allowedTargets = "[\"bridge\"]";
            attribute :>> wildcardTargets = false;
            attribute :>> unresolvedTargets = "[]";
        }
        part messaging : MessagingPolicy {
            attribute :>> enabled = false;
            attribute :>> allowedTargets = "[\"bridge\",\"*\",\"missing\"]";
            attribute :>> wildcardTargets = true;
            attribute :>> unresolvedTargets = "[\"missing\"]";
            ref part messagingTarget_bridge :> targets = Operators::agent_bridge;
        }
    }

    package Entries {
        part hook_parent : ExternalTrigger {
            attribute :>> name = "synthetic-hook";
            ref part :>> targetAgent = Operators::agent_parent;
        }
        part hook_missing : ExternalTrigger {
            attribute :>> name = "synthetic-unresolved-hook";
            attribute :>> unresolvedTarget = "missing";
        }
    }
}
