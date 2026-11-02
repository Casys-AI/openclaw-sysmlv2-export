package OpenClawImport {
    private import ScalarValues::*;
    part def OpenClawAgent :> AssemblyCore::SoftwareOperator {
        attribute id : String;
        attribute displayName : String;
        attribute emoji : String;
        attribute primaryModel : String;
        attribute fallbackModels : String;
    }
    enum def ToolOrigin {
        doc /* Where a tool comes from. MCP and CLI are origins of tools, not
         * separate categories. */
        builtin; plugin; mcp; cli;
    }
    part def OpenClawTool :> AssemblyCore::ExecutableCapability {
        doc /* One tool of the instance. toolId is OpenClaw's tool name. An MCP
         * tool <prefix>__* stands for every tool of its server; a CLI tool is a
         * command that the exec tool may run. provider names the plugin, the
         * MCP server or exec; built-in tools have none. */
        attribute toolId : String;
        attribute origin : ToolOrigin;
        attribute provider : String [0..1];
        attribute optional : Boolean;
    }
    part def ToolCatalog {
        doc /* Every tool granted to at least one agent, listed once. */
        part tools : OpenClawTool [0..*];
    }
    item def ToolGrant {
        doc /* An effective, positive grant of one catalog tool to one agent on
         * one policy layer (host or sandbox). A CLI grant also records how the
         * exec allowlist names the command (safe-bin, name or path) and whether
         * its arguments are restricted. */
        ref tool : OpenClawTool;
        attribute layer : String;
        attribute commandKind : String [0..1];
        attribute argsRestricted : Boolean [0..1];
    }
    part def Sandbox {
        attribute mode : String; attribute scope : String;
        attribute workspaceAccess : String; attribute image : String;
        attribute readOnlyRoot : Boolean; attribute network : String;
        attribute memory : String; attribute cpus : Real;
        attribute bindCount : Integer; attribute bindModes : String;
        attribute environmentNames : String;
    }
    part def ChannelAccount {
        attribute channel : String; attribute accountId : String;
        attribute enabled : Boolean; attribute dmPolicy : String;
        attribute groupPolicy : String;
    }
    connection def AgentBinding {
        end agent : OpenClawAgent;
        end account : ChannelAccount;
        attribute peerKind : String;
    }
    attribute def CronSchedule :> AssemblyCases::Schedule {
        attribute expression : String; attribute timezone : String;
    }
    attribute def AtSchedule :> AssemblyCases::Schedule { attribute instant : String; }
    attribute def MillisecondEvery :> AssemblyCases::Every { attribute durationMs : Integer; }
    part def ScheduledCase :> AssemblyCases::CaseType {
        attribute id : String; attribute displayName : String;
        attribute enabled : Boolean; attribute targetAgent : String;
    }
    part def ExternalTrigger {
        attribute name : String; attribute targetAgent : String;
        attribute deliveryChannel : String;
    }
    part def BundledSkill { attribute name : String; attribute enabled : Boolean; }
    part def InstructionFile { attribute path : String; attribute sha256 : String; attribute bytes : Integer; }
    part def DelegationRule { attribute fromAgent : String; attribute toAgent : String; }
    part def MessagingPolicy { attribute enabled : Boolean; attribute allowedTargets : String; }
    part def ModelProvider { attribute name : String; attribute apiKind : String; attribute modelIds : String; }
    part def OpenClawPlugin {
        doc /* Tool provider: its granted tools appear in the tool catalog with
         * origin plugin and this plugin as provider. */
        attribute pluginId : String; attribute enabled : Boolean;
        attribute tools : String; attribute optionalTools : String;
        attribute toolProfiles : String;
    }
    part def McpServer {
        doc /* Tool provider: its granted tools appear in the tool catalog with
         * origin mcp and this server as provider. */
        attribute serverId : String; attribute toolPrefix : String;
        attribute enabled : Boolean; attribute transport : String;
        attribute oauth : Boolean; attribute oauthIdentity : String;
        attribute toolInclude : String; attribute toolExclude : String;
        attribute envNames : String; attribute headerNames : String;
        attribute argCount : Integer;
    }
    part def ExecutionPosture {
        attribute host : String; attribute security : String; attribute ask : String;
        attribute mode : String; attribute approvalSecurity : String; attribute approvalAsk : String;
        attribute effectiveSecurity : String; attribute effectiveAsk : String;
        attribute elevated : Boolean; attribute elevatedChannelsCount : Integer;
        attribute safeBins : String; attribute safeBinProfiles : String;
        attribute trustedDirCount : Integer; attribute pathPrependCount : Integer;
        attribute strictInlineEval : Boolean;
    }
    part def ExecApprovals {
        attribute defaultSecurity : String; attribute defaultAsk : String;
        attribute askFallback : String; attribute autoAllowSkills : Boolean;
        attribute wildcardCommands : String;
    }
    part def AgentMemory {
        attribute searchEnabled : Boolean; attribute searchProvider : String;
        attribute searchModel : String; attribute searchFallback : String;
        attribute searchSources : String; attribute rememberAcrossConversations : Boolean;
        attribute extraPathCount : Integer; attribute multimodal : Boolean;
        attribute curatedSha256 : String; attribute curatedBytes : Integer;
        attribute dailyCount : Integer; attribute dailyFirstDate : String;
        attribute dailyLastDate : String; attribute dailyBytes : Integer;
        attribute dailySha256 : String; attribute otherCount : Integer;
    }
    part def MemoryBackend {
        attribute slot : String; attribute dreamingEnabled : Boolean;
        attribute dreamingFrequency : String; attribute dreamingTimezone : String;
        attribute activeMemoryEnabled : Boolean; attribute activeMemoryAgents : String;
        attribute activeMemoryChatTypes : String; attribute persistTranscripts : Boolean;
    }
}
