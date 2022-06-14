import { InputParameter } from "@modules/command";
import { Private } from "#genshin/module/private/main";
import { MysQueryService } from "#genshin/module/private/mys";
import { RenderResult } from "@modules/renderer";
import { mysInfoPromise } from "#genshin/utils/promise";
import { getPrivateAccount } from "#genshin/utils/private";
import { config, renderer } from "#genshin/init";

export async function main(
	{ sendMessage, messageData, auth, logger, redis }: InputParameter
): Promise<void> {
	const userID = messageData.msg.author.id;
	const idMsg = messageData.msg.content;
	const info: Private | string = await getPrivateAccount( userID, idMsg, auth );
	if ( typeof info === "string" ) {
		await sendMessage( info );
		return;
	}
	
	const { cookie, mysID } = info.setting;
	
	//优化我的主页查询
	const dbKey: string = `extr-wave-mypage-`;
	const image: string = await redis.getHashField( dbKey, `${ mysID }` );
	if ( image !== "" ) {
		await sendMessage( "七七找到了刚刚画好的图..." );
		await sendMessage( image );
	} else {
		
		try {
			await mysInfoPromise( userID, mysID, cookie );
		} catch ( error ) {
			if ( error !== "gotten" ) {
				await sendMessage( <string>error );
				return;
			}
		}
		
		await sendMessage( "获取成功，七七努力画图中..." );
		const res: RenderResult = await renderer.asCqCode(
			"/card.html", {
				qq: userID,
				style: config.cardWeaponStyle,
				profile: config.cardProfile,
				appoint: info.options[MysQueryService.FixedField].appoint
			} );
		if ( res.code === "ok" ) {
			await sendMessage( res.data );
			await redis.setHashField( dbKey, `${ mysID }`, res.data );
			await redis.setTimeout( dbKey, 6 * 3600 );
		} else {
			logger.error( res.error );
			await sendMessage( "图片渲染异常，请联系持有者进行反馈" );
		}
	}
}