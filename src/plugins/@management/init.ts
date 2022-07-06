import { AuthLevel } from "@modules/management/auth";
import { OrderConfig, SwitchConfig } from "@modules/command";
import { PluginSetting } from "@modules/plugin";

const manager: SwitchConfig = {
	type: "switch",
	mode: "divided",
	cmdKey: "adachi-manager",
	desc: [ "设置管理", "[@用户]" ],
	header: "",
	regexp: [ "<@!\\d+>" ],
	onKey: "man",
	offKey: "unman",
	auth: AuthLevel.Master,
	main: "manager",
	detail: "设置成员对BOT的管理权限，非QQ频道管理\n" +
		"后续可能同步实现频道管理（挖坑"
};

const ban: SwitchConfig = {
	type: "switch",
	mode: "divided",
	cmdKey: "adachi-ban",
	desc: [ "封禁用户", "[@用户]" ],
	header: "",
	regexp: [ "<@!\\d+>" ],
	onKey: "ban",
	offKey: "unban",
	auth: AuthLevel.Manager,
	main: "ban",
	detail: "封禁或者解禁某人对BOT的使用权"
};

const limit: SwitchConfig = {
	type: "switch",
	mode: "single",
	cmdKey: "adachi-limit",
	desc: [ "指令权限", "@用户 [key] #{OPT}" ],
	header: "limit",
	onKey: "on",
	offKey: "off",
	regexp: [ "<@!\\d+>", "[.-\\w]+", "#{OPT}" ],
	auth: AuthLevel.Manager,
	main: "limit",
	detail: "封禁或者解禁某人对BOT的具体某一指令使用权"
};

const refresh: OrderConfig = {
	type: "order",
	cmdKey: "adachi-hot-update-config",
	desc: [ "重载配置", "" ],
	headers: [ "refresh" ],
	regexps: [],
	auth: AuthLevel.Master,
	main: "refresh",
	detail: "该指令用于重新加载在 /config 目录中的部分配置文件（setting 不会重新加载）"
}

const announce: OrderConfig = {
	type: "order",
	cmdKey: "adachi-announce",
	desc: [ "发送公告", "" ],
	headers: [ "announce" ],
	regexps: [ ".+" ],
	auth: AuthLevel.Master,
	main: "announce",
	detail: "该指令用于全局发送公告"
}

export async function init(): Promise<PluginSetting> {
	return {
		pluginName: "@management",
		cfgList: [
			manager, refresh, ban, limit, announce
		]
	}
}