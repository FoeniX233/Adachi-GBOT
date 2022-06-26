/**
 Author: Ethereal
 CreateTime: 2022/6/12
 */
import * as sdk from "qq-guild-bot";
import { AvailableIntentsEventsEnum } from "qq-guild-bot";
import * as log from "log4js";
import moment from "moment";
import BotConfig from "./config";
import Database from "./database";
import Interval from "./management/interval";
import FileManagement from "./file";
import Plugin, { PluginReSubs } from "./plugin";
import WebConfiguration from "./logger";
import WebConsole from "@web-console/backend";
import RefreshConfig from "./management/refresh";
import { BasicRenderer } from "@modules/renderer";
import Command, { BasicConfig, MatchResult } from "./command/main";
import Authorization, { AuthLevel } from "./management/auth";
import MsgManagement, * as msg from "./message";
import MsgManager, { MemberMessage, Message, MessageScope, SendFunc } from "./message";
import { JobCallback, scheduleJob } from "node-schedule";
import { trim } from "lodash";
import Qiniuyun from "@modules/qiniuyun";
import { config } from "#genshin/init";
import { autoReply } from "@modules/chat";


export interface BOT {
	readonly redis: Database;
	readonly config: BotConfig;
	readonly client: sdk.IOpenAPI;
	readonly ws;
	readonly logger: log.Logger;
	readonly qiniuyun: Qiniuyun;
	readonly interval: Interval;
	readonly file: FileManagement;
	readonly auth: Authorization;
	readonly message: MsgManagement;
	readonly command: Command;
	readonly refresh: RefreshConfig;
	readonly renderer: BasicRenderer;
}

export class Adachi {
	public readonly bot: BOT;
	
	constructor( root: string ) {
		/* 初始化运行环境 */
		const file = new FileManagement( root );
		Adachi.setEnv( file );
		
		/* 初始化应用模块 */
		const config = new BotConfig( file );
		/* 实例化Logger */
		const logger = new WebConfiguration( config ).getLogger();
		if ( config.webConsole.enable ) {
			new WebConsole( config );
		}
		/* 创建七牛云实例*/
		const qiniuyun = new Qiniuyun( config );
		/* 创建client实例*/
		const client = sdk.createOpenAPI( {
			appID: config.appID,
			token: config.token,
			sandbox: config.sandbox
		} );
		// 创建 websocket 连接
		const ws = sdk.createWebsocket( {
				appID: config.appID,
				token: config.token,
				sandbox: config.sandbox,
				intents: this.getBotIntents( config )
			}
		);
		/* 捕获未知且未被 catch 的错误 */
		process.on( "unhandledRejection", reason => {
			if ( reason )
				logger.error( ( <Error>reason ).stack );
		} );
		
		const redis = new Database( config.dbPort, config.dbPassword, logger, file );
		const interval = new Interval( config, redis );
		const auth = new Authorization( config, redis );
		const message = new MsgManager( config, client );
		const command = new Command( file );
		const refresh = new RefreshConfig( file, command );
		const renderer = new BasicRenderer();
		
		this.bot = {
			client, ws, file, redis,
			logger, message, auth, command,
			config, refresh, renderer, interval, qiniuyun
		};
		
		refresh.registerRefreshableFunc( renderer );
	}
	
	public run(): BOT {
		Plugin.load( this.bot ).then( commands => {
			this.bot.command.add( commands );
			//是否登陆成功
			this.botOnline();
			/* 事件监听 ,根据机器人类型选择能够监听的事件 */
			if ( this.bot.config.area === "private" ) {
				/* 私域机器人 */
				this.bot.ws.on( "GUILD_MESSAGES", ( data ) => {
					if ( data.eventType === 'MESSAGE_CREATE' )
						this.parseGroupMsg( this )( data );
				} );
			} else {
				/* 公域机器人 */
				this.bot.ws.on( "PUBLIC_GUILD_MESSAGES", ( data ) => {
					if ( data.eventType === 'AT_MESSAGE_CREATE' )
						this.parseGroupMsg( this )( data );
				} );
			}
			/* 私信相关 */
			this.bot.ws.on( "DIRECT_MESSAGE", ( data ) => {
				if ( data.eventType === 'DIRECT_MESSAGE_CREATE' )
					this.parsePrivateMsg( this )( data );
			} );
			/* 成员变动相关 */
			this.bot.ws.on( "GUILD_MEMBERS", ( data ) => {
				if ( data.eventType === 'GUILD_MEMBER_REMOVE' )
					this.membersDecrease( this )( data );
			} )
			/* 当机器人进入或者离开频道,更新频道数量信息 */
			this.bot.ws.on( "GUILDS", ( data ) => {
				this.getBotBaseInfo( this );
			} )
			
			this.bot.logger.info( "事件监听启动成功" );
			this.getBotBaseInfo( this );
		} );
		
		scheduleJob( "0 59 */1 * * *", this.hourlyCheck( this ) );
		scheduleJob( "0 1 4 * * *", this.clearImage( this ) );
		return this.bot;
	}
	
	private static setEnv( file: FileManagement ): void {
		file.createDir( "config", "root" );
		const exist
			:
			boolean = file.createYAML( "setting", BotConfig.initObject );
		if ( exist ) {
			return;
		}
		
		/* Created by http://patorjk.com/software/taag  */
		/* Font Name: Big                               */
		const greet =
			`====================================================================
                _            _     _        ____   ____ _______
       /\\      | |          | |   (_)      |  _ \\ / __ \\__   __|
      /  \\   __| | __ _  ___| |__  _ ______| |_) | |  | | | |
     / /\\ \\ / _\` |/ _\` |/ __| '_ \\| |______|  _ <| |  | | | |
    / ____ \\ (_| | (_| | (__| | | | |      | |_) | |__| | | |
   /_/    \\_\\__,_|\\__,_|\\___|_| |_|_|      |____/ \\____/  |_|
 
====================================================================`
		console.log( greet );
		
		file.createDir( "database", "root" );
		file.createDir( "logs", "root" );
		
		file.createYAML(
			"cookies",
			{ cookies: [ "米游社Cookies(允许设置多个)" ] }
		);
		file.createYAML(
			"commands",
			{ tips: "此文件修改后需重启应用" }
		);
		
		console.log( "环境初始化完成，请在 /config 文件夹中配置信息" );
		process.exit( 0 );
	}
	
	/* 正则检测处理消息 */
	private async execute(
		messageData: msg.Message,
		sendMessage: SendFunc,
		cmdSet: BasicConfig[],
		limits: string[],
		unionRegExp: RegExp,
		isPrivate: boolean,
		isAt: boolean
	): Promise<void> {
		
		
		/* bot正在重载指令配置 */
		if ( this.bot.refresh.isRefreshing ) {
			await sendMessage( "BOT重载配置中，请稍后..." );
			return;
		}
		
		/* 匹配不到任何指令，触发聊天，对私域进行优化，不@BOT不会触发自动回复 */
		const content: string = messageData.msg.content;
		if ( this.bot.config.autoChat && !unionRegExp.test( content ) && isAt && content.length < 15 ) {
			await autoReply( messageData, sendMessage );
			return;
		}
		
		/* 用户数据统计与收集，当用户使用了指令之后才统计 */
		const userID: string = messageData.msg.author.id;
		const guildID: string = isPrivate ? "-1" : messageData.msg.guild_id; // -1 代表私聊使用
		await this.bot.redis.addSetMember( `adachi.user-used-groups-${ userID }`, guildID ); //使用过的用户包括使用过的频道
		if ( isPrivate && messageData.msg.src_guild_id ) { //私聊源频道也记录，修复未在频道使用用户信息读取问题
			await this.bot.redis.addSetMember( `adachi.user-used-groups-${ userID }`, messageData.msg.src_guild_id );
		}
		
		/* 获取匹配指令对应的处理方法 */
		const usable: BasicConfig[] = cmdSet.filter( el => !limits.includes( el.cmdKey ) );
		for ( let cmd of usable ) {
			const res: MatchResult = cmd.match( content );
			if ( res.type === "unmatch" ) {
				continue;
			}
			if ( res.type === "order" ) {
				const text: string = cmd.ignoreCase
					? content.toLowerCase() : content;
				messageData.msg.content = trim(
					msg.removeStringPrefix( text, res.header.toLowerCase() )
						.replace( / +/g, " " )
				);
			}
			cmd.run( {
				sendMessage, ...this.bot,
				messageData, matchResult: res
			} );
			
			/* 指令数据统计与收集 */
			await this.bot.redis.incHash( "adachi.hour-stat", userID.toString(), 1 ); //小时使用过的指令数目
			await this.bot.redis.incHash( "adachi.command-stat", cmd.cmdKey, 1 );
			return;
		}
		
		
	}
	
	/* 处理私聊事件 */
	private parsePrivateMsg( that: Adachi ) {
		const bot = that.bot;
		return async function ( messageData: Message ) {
			const authorName = messageData.msg.author.username;
			const userID = messageData.msg.author.id;
			const msgID = messageData.msg.id;
			const content = messageData.msg.content;
			const guildId: string = messageData.msg.guild_id;
			const auth: AuthLevel = await bot.auth.get( userID );
			const limit: string[] = await bot.redis.getList( `adachi.user-command-limit-${ userID }` );
			const sendMessage: SendFunc = await bot.message.sendPrivateMessage(
				guildId, msgID
			);
			const cmdSet: BasicConfig[] = bot.command.get( auth, MessageScope.Private );
			const unionReg: RegExp = bot.command.getUnion( auth, MessageScope.Private );
			await that.execute( messageData, sendMessage, cmdSet, limit, unionReg, true, true );
			bot.logger.info( `[Author: ${ authorName }][UserID: ${ userID }]: ${ content }` );
		}
	}
	
	/* 处理群聊事件 */
	private parseGroupMsg( that: Adachi ) {
		const bot = that.bot;
		return async function ( messageData: Message ) {
			const isAt = await that.checkAtBOT( messageData );
			const authorName = messageData.msg.author.username;
			const guild = messageData.msg.guild_id;
			const channelID = messageData.msg.channel_id;
			const userID = messageData.msg.author.id;
			const msgID = messageData.msg.id;
			const content = messageData.msg.content;
			
			const guildInfo = <sdk.IGuild>( await bot.client.guildApi.guild( guild ) ).data;
			const auth: AuthLevel = await bot.auth.get( userID );
			const gLim: string[] = await bot.redis.getList( `adachi.group-command-limit-${ guild }` );
			const uLim: string[] = await bot.redis.getList( `adachi.user-command-limit-${ userID }` );
			const sendMessage: msg.SendFunc = bot.message.sendGuildMessage(
				channelID, msgID );
			const cmdSet: BasicConfig[] = bot.command.get( auth, MessageScope.Group );
			const unionReg: RegExp = bot.command.getUnion( auth, MessageScope.Group );
			await that.execute( messageData, sendMessage, cmdSet, [ ...gLim, ...uLim ], unionReg, false, isAt );
			bot.logger.info( `[Author: ${ authorName }][Guild: ${ guildInfo.name }]: ${ content }` );
		}
	}
	
	/*去掉消息中的@自己信息*/
	private async checkAtBOT( msg: Message ): Promise<boolean> {
		const botID = await this.bot.redis.getString( `adachi.user-bot-id` );
		let atBOTReg: RegExp;
		if ( botID ) { //如果自身信息获取失败，默认去除第一个@信息
			atBOTReg = new RegExp( `<@!${botID}>` );
		} else {
			atBOTReg = new RegExp( `<@!\\d+>` );
		}
		const content: string = msg.msg.content;
		
		if ( atBOTReg.test( content ) ) {
			msg.msg.content = content
				.replace( atBOTReg, "" )
				.trim();
			return true;
		}
		return false;
	}
	
	/* 数据统计 与 超量使用监看 */
	private hourlyCheck( that: Adachi ): JobCallback {
		const bot = that.bot;
		return function (): void {
			bot.redis.getHash( "adachi.hour-stat" ).then( async data => {
				const cmdOverusedUser: string[] = [];
				const threshold: number = bot.config.countThreshold;
				Object.keys( data ).forEach( key => {
					if ( parseInt( data[key] ) > threshold ) {
						cmdOverusedUser.push( key );
					}
				} );
				
				const length: number = cmdOverusedUser.length;
				if ( length !== 0 ) {
					const msg: string =
						`上个小时内有 ${ length } 个用户指令使用次数超过了阈值` +
						[ "", ...cmdOverusedUser.map( el => `${ el }: ${ data[el] }次` ) ]
							.join( "\n  - " );
					// await bot.message.sendMaster(msg);
					/*频道限制BOT主动推送消息次数*/
					bot.logger.info( msg );
				}
				await bot.redis.deleteKey( "adachi.hour-stat" );
			} );
			
			bot.redis.getHash( "adachi.command-stat" ).then( async data => {
				const hourID: string = moment().format( "yy/MM/DD/HH" );
				await bot.redis.deleteKey( "adachi.command-stat" );
				await bot.redis.setString( `adachi.command-stat-${ hourID }`, JSON.stringify( data ) );
			} );
		}
	}
	
	/* 清除所有图片缓存 */
	private clearImage( that: Adachi ): JobCallback {
		const bot = that.bot;
		return function (): void {
			bot.redis.getKeysByPrefix( `adachi-temp-*` ).then( async data => {
				data.forEach( value => {
					bot.redis.deleteKey( value );
				} );
			} );
			bot.logger.info( "已清除所有缓存图片链接" );
		}
	}
	
	/**
	 * 获取BOT类型，并返回正确的intents
	 * 为使BOT能正确启动，默认最小权限
	 * 有额外事件需要，请先提前开启BOT在频道中的权限后添加
	 * 参考地址：https://bot.q.qq.com/wiki/develop/api/gateway/intents.html
	 */
	private getBotIntents( config: BotConfig ): Array<AvailableIntentsEventsEnum> {
		let intents: Array<AvailableIntentsEventsEnum> = [
			AvailableIntentsEventsEnum.GUILDS,
			AvailableIntentsEventsEnum.GUILD_MEMBERS,
			AvailableIntentsEventsEnum.GUILD_MESSAGE_REACTIONS,
			AvailableIntentsEventsEnum.DIRECT_MESSAGE,
			AvailableIntentsEventsEnum.INTERACTION,
			AvailableIntentsEventsEnum.MESSAGE_AUDIT,
			AvailableIntentsEventsEnum.AUDIO_ACTION,
			AvailableIntentsEventsEnum.PUBLIC_GUILD_MESSAGES
			// AvailableIntentsEventsEnum.FORUMS_EVENT, //仅私域可用
			// AvailableIntentsEventsEnum.GUILD_MESSAGES //仅私域可用
		];
		/* 仅私域BOT可以监听非@自己的消息 */
		if ( config.area === "private" ) {
			intents.push( AvailableIntentsEventsEnum.GUILD_MESSAGES,
				AvailableIntentsEventsEnum.FORUMS_EVENT );
		}
		return intents;
		
	}
	
	
	/* 获取BOT所在频道基础信息 */
	private getBotBaseInfo( that: Adachi ) {
		const bot = that.bot;
		bot.client.meApi.me().then( async res => {
			if ( !res.data.id ) {
				bot.logger.error( "获取BOT自身信息失败..." );
				return;
			}
			await this.bot.redis.setString( `adachi.user-bot-id`, res.data.id );
		} );
		bot.client.meApi.meGuilds().then( async r => {
			const guilds: sdk.IGuild[] = r.data;
			if ( guilds.length <= 0 ) {
				bot.logger.error( "获取频道信息失败..." );
			} else {
				await bot.redis.deleteKey( `adachi.guild-used` ); //重启重新获取BOT所在频道信息
				let ack: boolean = false;
				for ( let guild of guilds ) {
					await bot.redis.addSetMember( `adachi.guild-used`, guild.id ); //存入BOT所进入的频道
					if ( guild.owner_id === this.bot.config.master && !ack ) {
						await bot.redis.setString( `adachi.guild-master`, guild.id ); //当前BOT主人所在频道
						ack = true;
						continue;
					}
				}
				if ( !ack ) {
					bot.logger.error( "频道信息获取错误，或者MasterID设置错误，部分功能会受到影响" );
				}
			}
		} );
	}
	
	private botOnline() {
		if ( this.bot.ws.alive ) {
			this.bot.logger.info( "BOT启动成功" );
		}
	}
	
	/* 用户退出频道事件 */
	private membersDecrease( that: Adachi ) {
		const bot = that.bot
		return async function ( messageData: MemberMessage ) {
			const userId = messageData.msg.user.id;
			/* 此处应该重构，或者等待新框架，好麻烦 */
			const dbKey = `adachi.user-used-groups-${ userId }`;
			const bindUID = `silvery-star.user-bind-uid-${ userId }`;
			const wishWeapon = `silvery-star-wish-weapon-${ userId }`;
			const wishResult = `silvery-star-wish-result-${ userId }`;
			const wishIndefinite = `silvery-star-wish-indefinite-${ userId }`;
			const wishStatistic = `silvery-star-wish-statistic-${ userId }`;
			const wishChoice = `silvery-star-wish-choice-${ userId }`;
			//首先清除所有订阅服务
			for ( const plugin in PluginReSubs ) {
				try {
					await PluginReSubs[plugin].reSub( userId, bot );
				} catch ( error ) {
					bot.logger.error( `插件${ plugin }取消订阅事件执行异常：${ <string>error }` )
				}
			}
			//清除使用记录
			await bot.redis.deleteKey( dbKey, bindUID, wishWeapon, wishResult, wishIndefinite, wishStatistic, wishChoice );
		}
	}
}