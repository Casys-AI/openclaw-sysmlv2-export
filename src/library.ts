import cases from "../sysml/cases.sysml" with { type: "text" };
import core from "../sysml/core.sysml" with { type: "text" };
import skills from "../sysml/skills.sysml" with { type: "text" };

/** The Assembly packages the import builds on (AssemblyCore, AssemblyCases,
 * APESkills), copied from live-builder/models and shipped in every export
 * directory so it compiles alone. Embedded as text for the bundled plugin. */
export const ASSEMBLY_LIBRARY: ReadonlyMap<string, string> = new Map([
  ["core.sysml", core],
  ["cases.sysml", cases],
  ["skills.sysml", skills],
]);

/** Import extension only: specializes the Assembly library, never redefines it. */
export const OPENCLAW_IMPORT = `package OpenClawImport {
    private import ScalarValues::*;
    part def OpenClawAgent :> AssemblyCore::SoftwareOperator {
        attribute id : String;
        attribute displayName : String;
        attribute emoji : String;
        attribute primaryModel : String;
        attribute fallbackModels : String;
    }
    item def ToolGrant { attribute tool : String; attribute layer : String; attribute pluginId : String; }
    item def CommandGrant { attribute command : String; attribute kind : String; attribute argsRestricted : Boolean; }
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
    part def OpenClawPlugin { attribute pluginId : String; attribute enabled : Boolean; attribute tools : String; attribute optionalTools : String; }
    part def McpServer {
        attribute serverId : String; attribute toolPrefix : String;
        attribute enabled : Boolean; attribute transport : String;
        attribute oauth : Boolean; attribute oauthIdentity : String;
        attribute toolInclude : String; attribute toolExclude : String;
        attribute envNames : String; attribute headerNames : String;
        attribute argCount : Integer;
    }
    part def ExecutionPosture {
        attribute host : String; attribute security : String; attribute ask : String;
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
`;
