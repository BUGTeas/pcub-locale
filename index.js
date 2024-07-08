const fs = require('fs'); 
try{
	var OpenCC = require('opencc');
	console.log("已安装OpenCC包，将进行繁体转换。");
} catch (error) {
	var OpenCC = false;
	console.log("尚未安装OpenCC包，将不会进行繁体转换。");
}
if (OpenCC) {
	var conv_s2t = new OpenCC('s2t.json');
	var conv_s2tw = new OpenCC('s2tw.json');
	var conv_s2twp = new OpenCC('s2twp.json');
	var conv_s2hk = new OpenCC('s2hk.json');
}

//导出文件
const autoOut = async function (path, data){
	const pathArr = path.split("/");
	var checkProcess = "";
	var index = 0;
	for (; index < pathArr.length - 1; index ++) {
		checkProcess += pathArr[index] + "/";
		try {
			fs.accessSync(checkProcess);
		} catch (error) {
			try {
				fs.mkdirSync(checkProcess);
				console.log("已创建文件夹：" + checkProcess)
			} catch (error) {
				console.error(error)
			}
		}
	}
	try {
		fs.writeFileSync(path, data);
		console.log("已写入文件：" + path)
	} catch (error) {
		console.error(error)
	}
}

//输出lang格式内容
function langStr(src) {
	var result = "";
	for (var objectKey in src){
		var objectValue = src[objectKey];
		//避免空内容
		if (objectValue == "") objectValue = " ";
		else {
			//替换转义符
			var objectValue = objectValue.replaceAll("\n", "\\n");//escapeTransformation(objectValue);
		}
		result += "\n" + objectKey + "=" + objectValue
	}
	return result.substring(1);
}

//预处理
function presetBedrock(object, key) {
	//替换星号
	value = object[key].replaceAll("★", "\ue1ff")
	//修复秋漏写
	if(key == "pl.info.instance5.end2" && /§6然四圣兽/g.test(value)) value = value.replaceAll("§6然四圣兽", "§6虽然四圣兽");
	//清除进度尾部空格
	if (/^pl.adv./g.test(key) && /.title$/g.test(key)) value = value.substring(0,value.search(/\s*$/g));
	if (/^pl.book./g.test(key) && /_hide_/g.test(key)) {
		value = value.replaceAll("\n", "");
		var headIndex = value.search(/点击/g)
		if (headIndex != -1) value = ((/_hide_mission_item/g.test(key)) ? "" : "\n\n\n") + "§p§l请通过菜单书" + ((key == "pl.book.zhan_hide_mission_item" && /点击谷主/g.test(value)) ? "领取" : "") + value.substring(headIndex + 2) + "。";
	}
	return value;
}

//替换转义符
function escapeTransformation(text) {
	const stringify = JSON.stringify(text);
	return stringify.substring(1, stringify.length - 1)
	// return text.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll("\t", "\\t");
}

//主处理
const process = async function (sourceSpace) {
	var loadJavaAction = [];
	const bedrockCN = new Object();
	const bedrockTW = new Object();
	const geyserCN = new Object();
	const geyserTW = new Object();
	const packRoot = "./resources/" + sourceSpace + "/assets/";
	try {
		fs.accessSync(packRoot);
		var JSONList = new Array();
		const nameSpaces = fs.readdirSync(packRoot);
		for (const s in nameSpaces) try {
			fs.accessSync(packRoot + nameSpaces[s] + "/lang");
			JSONList.push(nameSpaces[s])
		} catch (err) {}
	} catch (err) {
		var JSONList = false;
	}
	//先处理Java资源包语言文件
	if (JSONList) for (const l in JSONList) {
		const srcStr = fs.readFileSync("./resources/" + sourceSpace + "/assets/" + JSONList[l] + "/lang/zh_cn.json");
		const javaCN = JSON.parse(srcStr), javaTW = {}, javaHK = {}
		const subConvertAction = [];
		for (const key in javaCN) {
			const preseted = presetBedrock(javaCN, key);
			if (JSONList[l] == "minecraft") bedrockCN[key] = preseted;
			geyserCN[key] = preseted;
			//配置单个键值的异步转换
			//Java 港台
			if(OpenCC) subConvertAction.push(
				conv_s2tw.convertPromise(javaCN[key]).then( converted => {
					javaTW[key] = converted;
				} )
			)
			if(OpenCC) subConvertAction.push(
				conv_s2hk.convertPromise(javaCN[key]).then( converted => {
					javaHK[key] = converted;
				} )
			)
			//互通繁体
			if(OpenCC) subConvertAction.push(
				conv_s2tw.convertPromise(preseted).then( converted => {
					//crossTW[key] = converted;
					if (JSONList[l].split(":")[1] == "minecraft") bedrockTW[key] = converted;
					geyserTW[key] = converted;
				} )
			)
		};
		//同步到客户端数据
		//bedrockObjCN = Object.assign(bedrockObjCN,crossCN)
		//输出当前语言文件
		autoOut("./output/" + sourceSpace + "/assets/" + JSONList[l] + "/lang/zh_cn.json", srcStr);
		//配置单个源文件的异步转换
		loadJavaAction.push(
			Promise.all(subConvertAction).then(function(){
				//bedrockObjTW = Object.assign(bedrockObjTW,crossTW);
				//输出当前语言文件
				autoOut("./output/" + sourceSpace + "/assets/" + JSONList[l] + "/lang/zh_hk.json", JSON.stringify(Object.assign(javaCN,javaHK)));
				autoOut("./output/" + sourceSpace + "/assets/" + JSONList[l] + "/lang/zh_tw.json", JSON.stringify(Object.assign(javaCN,javaTW)));
			})
		)
	}
	//后处理patch独立文件，然后导出geyser和基岩语言
	Promise.all(loadJavaAction).then(function(){
		const obj = JSON.parse(fs.readFileSync("./patch/" + sourceSpace + ".json"));
		const moduleConvertAction = new Array();
		const commonAvail = obj.common != undefined;
		const crossAvail = obj.cross != undefined;
		const javaAvail = obj.java != undefined;
		const geyserAvail = obj.geyser != undefined;
		const bedrockAvail = obj.bedrock != undefined;
		const javaCN = new Object();
		const javaTW = new Object();
		const javaHK = new Object();
		//Java 版文件
		if (javaAvail) {
			Object.assign(
				javaCN, 
				(commonAvail) ? obj.common.base : {},
				(commonAvail) ? obj.common.conversion : {},
				obj.java.base,
				obj.java.conversion
			);
			//输出
			autoOut("./output/" + sourceSpace + "/assets/pcub/lang/zh_cn.json", JSON.stringify(javaCN));
			//后备
			autoOut("./output/" + sourceSpace + "/assets/pcub/lang/en_us.json", JSON.stringify(Object.assign({},
				(commonAvail) ? obj.common.fallback : {},
				obj.java.fallback
			)));
		}
		//Geyser JSON 文件
		if (geyserAvail) {
			Object.assign(
				geyserCN,
				(commonAvail) ? obj.common.base : {},
				(commonAvail) ? obj.common.conversion : {},
				(crossAvail) ? obj.cross.base : {},
				(crossAvail) ? obj.cross.conversion : {},
				obj.geyser.base,
				obj.geyser.conversion
			);
			//输出
			autoOut("./output/" + sourceSpace + "/overrides/zh_cn.json", JSON.stringify(geyserCN));
			//后备
			autoOut("./output/" + sourceSpace + "/overrides/en_us.json", JSON.stringify(Object.assign({},
				(commonAvail) ? obj.common.fallback : {},
				(crossAvail) ? obj.cross.fallback : {},
				obj.geyser.fallback
			)));
		}
		//客户端 LANG 文件
		if (bedrockAvail) {
			Object.assign(
				bedrockCN,
				(commonAvail) ? obj.common.base : {},
				(commonAvail) ? obj.common.conversion : {},
				(crossAvail) ? obj.cross.base : {},
				(crossAvail) ? obj.cross.conversion : {},
				obj.bedrock.base,
				obj.bedrock.conversion
			);
			//输出
			autoOut("./output/" + sourceSpace + "/texts/zh_CN.lang", langStr(bedrockCN));
			//后备
			autoOut("./output/" + sourceSpace + "/texts/en_US.lang", langStr(Object.assign({},
				(commonAvail) ? obj.common.fallback : {},
				(crossAvail) ? obj.cross.fallback : {},
				obj.bedrock.fallback
			)));
		}
		//开始繁体转换
		//通用转换部分
		if (commonAvail) for (const key in obj.common.conversion) {
			var preseted = obj.common.conversion[key];
			if(OpenCC) moduleConvertAction.push(
				conv_s2hk.convertPromise(preseted).then( converted => {
					javaHK[key] = converted;
				} )
			)
			if(OpenCC) moduleConvertAction.push(
				conv_s2tw.convertPromise(preseted).then( converted => {
					javaTW[key] = bedrockTW[key] = geyserTW[key] = converted;
				} )
			)
		};
		//Java 转换部分
		if (javaAvail) for (const key in obj.java.conversion) {
			var preseted = obj.java.conversion[key];
			if(OpenCC) moduleConvertAction.push(
				conv_s2hk.convertPromise(preseted).then( converted => {
					javaHK[key] = converted;
				} )
			)
			if(OpenCC) moduleConvertAction.push(
				conv_s2tw.convertPromise(preseted).then( converted => {
					javaTW[key] = converted;
				} )
			)
		};
		//互通通用部分
		if (crossAvail) for (const key in obj.cross.conversion) {
			var preseted = obj.cross.conversion[key];
			if(OpenCC) moduleConvertAction.push(
				conv_s2tw.convertPromise(preseted).then( converted => {
					bedrockTW[key] = geyserTW[key] = converted;
				} )
			)
		};
		//Geyser 部分
		if (geyserAvail) for (const key in obj.geyser.conversion) {
			var preseted = obj.geyser.conversion[key];
			if(OpenCC) moduleConvertAction.push(
				conv_s2tw.convertPromise(preseted).then( converted => {
					geyserTW[key] = converted;
				} )
			)
		};
		//客户端部分
		if (bedrockAvail) for (const key in obj.bedrock.conversion) {
			var preseted = obj.bedrock.conversion[key];
			if(OpenCC) moduleConvertAction.push(
				conv_s2tw.convertPromise(preseted).then( converted => {
					bedrockTW[key] = converted;
				} )
			)
		};
		//转换完毕，输出繁体文件
		Promise.all(moduleConvertAction).then(function(){
			if (javaAvail) autoOut("./output/" + sourceSpace + "/assets/pcub/lang/zh_tw.json", JSON.stringify(Object.assign({},
				javaCN,	//有序的同步输出，用于整理数据顺序，并提供base项
				javaTW,	//无序的异步转换，不包含base项
				(commonAvail) ? obj.common.tw : {},	//无需转换的本地化部分
				obj.java.tw	//无需转换的本地化部分
			)));
			if (javaAvail) autoOut("./output/" + sourceSpace + "/assets/pcub/lang/zh_hk.json", JSON.stringify(Object.assign({},
				javaCN,
				(commonAvail) ? obj.common.tw : {},
				obj.java.tw,
				javaHK,
				(commonAvail) ? obj.common.hk : {},
				obj.java.hk
			)));
			if (geyserAvail) autoOut("./output/" + sourceSpace + "/overrides/zh_tw.json", JSON.stringify(Object.assign({},
				geyserCN,
				geyserTW,
				(commonAvail) ? obj.common.tw : {},
				(crossAvail) ? obj.cross.tw : {},
				obj.geyser.tw
			)));
			if (bedrockAvail) autoOut("./output/" + sourceSpace + "/texts/zh_TW.lang", langStr(Object.assign({},
				bedrockCN,
				bedrockTW,
				(commonAvail) ? obj.common.tw : {},
				(crossAvail) ? obj.cross.tw : {},
				obj.bedrock.tw
			)));
		})
	})
};

module.exports = {process};