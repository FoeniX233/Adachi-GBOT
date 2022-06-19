import { PluginSetting } from "@modules/plugin";
import { OrderConfig } from "@modules/command";
import { autoSign } from "./achieves/auto_sign";

const msign_enable: OrderConfig = {
	type: "order",
	cmdKey: "extr-wave-yysign-enable",
	desc: [ "开启云原神签到", "" ],
	headers: [ "onyys" ],
	regexps: [ ".+" ],
	main: "achieves/enable_sign",
	detail: "参数为token，获取方式查看 https://blog.ethreal.cn"
};

const msign_disable: OrderConfig = {
	type: "order",
	cmdKey: "extr-wave-yysign-disable",
	desc: [ "取消云原神签到", "" ],
	headers: [ "offyys" ],
	regexps: [],
	main: "achieves/disable_sign",
	detail: ""
};

// 不可 default 导出，函数名固定
export async function init(): Promise<PluginSetting> {
	await autoSign();
	return {
		pluginName: "yyscloud",
		cfgList: [ msign_enable, msign_disable ]
	};
}