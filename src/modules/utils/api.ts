/**
Author: Ethereal
CreateTime: 2022/6/21
 */
import request from "@modules/requests";

interface ApiType {
	qingyunke: string,
	poetry: string,
	hitokoto: string,
	dogs: string,
	lovelive: string
}

export const API: ApiType = {
	qingyunke: "http://api.qingyunke.com/api.php?key=free&appid=0&msg=",
	poetry: "https://v1.hitokoto.cn?encode=text&&c=i",
	hitokoto: "https://v1.hitokoto.cn?encode=text&&c=j", //获取一言网站的一句话，具体详情 https://developer.hitokoto.cn/sentence/
	lovelive: "https://api.lovelive.tools/api/SweetNothings/Serialization/Text", //获取一句情话，具体参见 https://lovelive.tools/
	dogs: "https://api.dzzui.com/api/tiangou?format=json" //获取一段舔狗日记
};

const HEADERS = {
	"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.74 Safari/537.36 Edg/99.0.1150.46",
	"Accept-Encoding": "gzip, deflate",
	"Connection": "keep-alive",
	"Accept": "*/*"
};


//调用青云客的免费对话API，但是延迟比较高，2s左右，详情http://api.qingyunke.com/
async function getBaseChat( text: string ): Promise<any> {
	return new Promise( ( resolve, reject ) => {
		const URL = encodeURI( API.qingyunke + text );
		request( {
			method: "GET",
			url: URL,
			headers: {
				...HEADERS,
			},
			timeout: 6000
		} )
			.then( ( result ) => {
				const date = JSON.parse( result );
				resolve( date );
			} )
			.catch( ( reason ) => {
				reject( reason );
			} );
	} );
}

export async function getChatResponse( text: string ): Promise<string> {
	let msg = await getBaseChat( text );
	if ( !msg || msg.result !== 0 ) {
		return `接口挂掉啦~~`;
	}
	//API默认的名字是 “菲菲”，你可以改成你喜欢的名字
	//修改可能导致部分返回错误，比如 “菲菲公主” ---> “阿晴公主”
	const reg = new RegExp( '菲菲', "g" );
	const regExp = new RegExp( 'tianyu', "g" );
	const regExp1 = new RegExp( '\{br\}', 'g' );
	msg.content = msg.content.replace( reg, '阿晴' );
	msg.content = msg.content.replace( regExp, '伍陆柒' ).trim();
	msg.content = msg.content.replace( regExp1, '\n\n' );
	return msg.content;
}

export async function getWeDog(): Promise<string> {
	return new Promise( ( resolve, reject ) => {
		request( {
			method: "GET",
			url: API.dogs,
			headers: {
				...HEADERS,
			}
		} )
			.then( ( result ) => {
				const msg = JSON.parse( result );
				resolve( msg.text );
			} )
			.catch( ( reason ) => {
				reject( reason );
			} );
	} );
}


export async function getTextResponse( type: string ): Promise<string> {
	return new Promise( ( resolve, reject ) => {
		request( {
			method: "GET",
			url: type,
			headers: {
				...HEADERS,
			}
		} )
			.then( ( result ) => {
				resolve( result );
			} )
			.catch( ( reason ) => {
				reject( reason );
			} );
	} );
}

//获取随机表情包
export function getEmoji(): string {
	//当指令后没有跟数据，随机返回此数组里面的一句话
	const text = [ "https://c2cpicdw.qpic.cn/offpic_new/1678800780//1678800780-2229448361-C4D4506256984E0951AE70EF2D39C7AF/0?term=2",
		"https://c2cpicdw.qpic.cn/offpic_new/1678800780//1678800780-4170714532-4E83609698BC1753845AA0BE8D66051D/0?term=2",
		"https://c2cpicdw.qpic.cn/offpic_new/1678800780//1678800780-3888586142-E9BD0789F60B2045ECBA19E36DD25EC7/0?term=2",
		"https://c2cpicdw.qpic.cn/offpic_new/1678800780//1678800780-2518379710-D757D5240D4B157D098B1719921969A1/0?term=2"
	];
	//Math.random()返回0-1之间随机一个数，确保text数组长度不要为1，可能会报空指针异常
	return text[Math.round( Math.random() * text.length - 1 )];
}

