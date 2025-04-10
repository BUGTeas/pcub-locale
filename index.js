const fs = require('fs'); 
try{
	var OpenCC = require('opencc');
	console.log("已安装OpenCC包，将进行繁体转换。");
} catch (error) {
	var OpenCC = false;
	console.warn("尚未安装OpenCC包，将不会进行繁体转换。");
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
function presetBedrock(key, value) {
	//替换星号
	value = value.replaceAll("★", "\ue1ff")
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

// 主处理
const process = async function (...packNameList) {
	// 整个实例下的对象
	const bedrockCN = new Object();
	const bedrockTW = new Object();
	const geyserCN = new Object();
	const geyserTW = new Object();
	const bedrockNonConvTW = new Object();
	const geyserNonConvTW = new Object();
	// {命名空间: {键名: 键值}}
	const javaCN = new Object();
	const javaTW = new Object();
	const javaHK = new Object();
	// 异步执行
	const convertTask = [];

	const mainPackName = packNameList[0];

	for (const packIndex in packNameList) {
		const packName = packNameList[packIndex];
		const packRoot = "./resources/" + packName + "/assets/";
		const packObj = new Object();
		// 读取资源包
		let dirList = [];
		try { dirList = fs.readdirSync(packRoot); } catch (e) {}
		for (const s in dirList) {
			const namespace = dirList[s];
			let langObj = false;
			try { langObj = JSON.parse(fs.readFileSync(packRoot + namespace + "/lang/zh_cn.json")); } catch (e) {}
			if (langObj) {
				packObj[namespace] = langObj
			}
		}
		// 遍历命名空间
		for (const namespace in packObj) {
			// 初始化命名空间对象
			const packNsObj = packObj[namespace];
			if (!javaCN[namespace]) {
				javaCN[namespace] = packNsObj;
				javaTW[namespace] = {};
				javaHK[namespace] = {};
			} else {
				Object.assign(javaCN[namespace], packNsObj);
			}
			// 遍历键
			for (const key in packNsObj) {
				const value = packNsObj[key];
				// 转换
				const preseted = presetBedrock(key, value);
				if (namespace == "minecraft") bedrockCN[key] = preseted;
				geyserCN[key] = preseted;
				if(OpenCC) {
					convertTask.push(
						conv_s2tw.convertPromise(value).then( converted => {
							javaTW[namespace][key] = converted;
						} ),
						conv_s2hk.convertPromise(value).then( converted => {
							javaHK[namespace][key] = converted;
						} ),
						conv_s2tw.convertPromise(preseted).then( converted => {
							if (namespace == "minecraft") bedrockNonConvTW[key] = converted;
							geyserNonConvTW[key] = converted;
						} )
					)
				}
			}
		}

		// 补丁文件
		const patchConvertTask = new Array();
		const commonConvHK = new Object();
		const commonConvTW = new Object();
		const javaPatchCN = new Object();
		const javaPatchConvHK = new Object();
		const javaPatchConvTW = new Object();
		const crossConvTW = new Object();
		const geyserPatchConvTW = new Object();
		const bedrockPatchConvTW = new Object();
		
		let patchObj = false;
		try { patchObj = JSON.parse(fs.readFileSync("./patch/" + packName + ".json")); } catch (e) {}

		// Java 客户端
		if (patchObj.java) {
			Object.assign(javaPatchCN, 
				(patchObj.common) ? patchObj.common.base : {},
				(patchObj.common) ? patchObj.common.conversion : {},
				patchObj.java.base,
				patchObj.java.conversion
			);
			// 后备
			autoOut("./output/" + mainPackName + "/assets/pcub/lang/en_us.json", JSON.stringify(Object.assign({},
				(patchObj.common) ? patchObj.common.fallback : {},
				patchObj.java.fallback
			)));
			// 繁体转换
			if (OpenCC) for (const key in patchObj.java.conversion) {
				const preseted = patchObj.java.conversion[key];
				patchConvertTask.push(
					conv_s2hk.convertPromise(preseted).then( converted => {
						javaPatchConvHK[key] = converted;
					} ),
					conv_s2tw.convertPromise(preseted).then( converted => {
						javaPatchConvTW[key] = converted;
					} )
				)
			}
			// 合并
			if (javaCN.pcub) {
				Object.assign(javaCN.pcub, javaPatchCN);
			} else {
				javaCN.pcub = javaPatchCN;
			}
		}

		// Geyser 专用
		if (patchObj.geyser) {
			Object.assign(geyserCN,
				(patchObj.common) ? patchObj.common.base : {},
				(patchObj.common) ? patchObj.common.conversion : {},
				(patchObj.cross) ? patchObj.cross.base : {},
				(patchObj.cross) ? patchObj.cross.conversion : {},
				patchObj.geyser.base,
				patchObj.geyser.conversion
			);
			// 后备
			autoOut("./output/" + mainPackName + "/overrides/en_us.json", JSON.stringify(Object.assign({},
				(patchObj.common) ? patchObj.common.fallback : {},
				(patchObj.cross) ? patchObj.cross.fallback : {},
				patchObj.geyser.fallback
			)));
			// 繁体转换
			if (OpenCC) for (const key in patchObj.geyser.conversion) {
				const preseted = patchObj.geyser.conversion[key];
				patchConvertTask.push(
					conv_s2tw.convertPromise(preseted).then( converted => {
						geyserPatchConvTW[key] = converted;
					} )
				)
			}
		}
		// 输出
		autoOut("./output/" + mainPackName + "/overrides/zh_cn.json", JSON.stringify(geyserCN));

		// 基岩客户端
		if (patchObj.bedrock) {
			Object.assign(bedrockCN,
				(patchObj.common) ? patchObj.common.base : {},
				(patchObj.common) ? patchObj.common.conversion : {},
				(patchObj.cross) ? patchObj.cross.base : {},
				(patchObj.cross) ? patchObj.cross.conversion : {},
				patchObj.bedrock.base,
				patchObj.bedrock.conversion
			);
			// 后备
			autoOut("./output/" + mainPackName + "/texts/en_US.lang", langStr(Object.assign({},
				(patchObj.common) ? patchObj.common.fallback : {},
				(patchObj.cross) ? patchObj.cross.fallback : {},
				patchObj.bedrock.fallback
			)));
			// 繁体转换
			if (OpenCC) for (const key in patchObj.bedrock.conversion) {
				const preseted = patchObj.bedrock.conversion[key];
				patchConvertTask.push(
					conv_s2tw.convertPromise(preseted).then( converted => {
						bedrockPatchConvTW[key] = converted;
					} )
				)
			}
		}
		// 输出
		autoOut("./output/" + mainPackName + "/texts/zh_CN.lang", langStr(bedrockCN));
		
		// 通用繁体转换
		// 互通通用
		if (patchObj.cross && OpenCC) for (const key in patchObj.cross.conversion) {
			const preseted = patchObj.cross.conversion[key];
			patchConvertTask.push(
				conv_s2tw.convertPromise(preseted).then( converted => {
					crossConvTW[key] = converted;
				} )
			)
		};
		// 全部通用
		if (patchObj.common && OpenCC) for (const key in patchObj.common.conversion) {
			const preseted = patchObj.common.conversion[key];
			patchConvertTask.push(
				conv_s2hk.convertPromise(preseted).then( converted => {
					commonConvHK[key] = converted;
				} ),
				conv_s2tw.convertPromise(preseted).then( converted => {
					commonConvTW[key] = converted;
				} )
			)
		};

		convertTask.push(
			Promise.all(patchConvertTask).then(function(){
				// 合并到 Java 客户端
				if (patchObj.java) {
					const javaPatchTW = Object.assign({},
						javaPatchCN,	// 有序，用于整理数据顺序，并提供base项
						commonConvTW,	// 无序，不包含base项
						javaPatchConvTW,	// 无序，不包含base项
						(patchObj.common) ? patchObj.common.tw : {},	//无需转换的本地化部分
						(patchObj.java) ? patchObj.java.tw : {}	//无需转换的本地化部分
					)
					if (javaTW.pcub) {
						Object.assign(javaTW.pcub, javaPatchTW);
					} else {
						javaTW.pcub = javaPatchTW;
					}
					const javaPatchHK = Object.assign({},
						javaPatchTW,	// 继承了 TW 转换
						commonConvHK,	// 无序，不包含base项
						javaPatchConvHK,	// 无序，不包含base项
						(patchObj.common) ? patchObj.common.hk : {},	//无需转换的本地化部分
						(patchObj.java) ? patchObj.java.hk : {}	//无需转换的本地化部分
					)
					if (javaHK.pcub) {
						Object.assign(javaHK.pcub, javaPatchHK);
					} else {
						javaHK.pcub = javaPatchHK;
					}
				}

				// 合并到 Geyser 专用
				Object.assign(geyserTW,
					geyserCN,	// 有序，用于整理数据顺序，并提供base项
					geyserNonConvTW,	// 无序，资源包内容，不包含base项
					commonConvTW,
					crossConvTW,
					geyserPatchConvTW,
					(patchObj.common) ? patchObj.common.tw : {},
					(patchObj.cross) ? patchObj.cross.tw : {},
					(patchObj.geyser) ? patchObj.geyser.tw : {}
				)

				// 合并到基岩客户端
				Object.assign(bedrockTW,
					bedrockCN,	// 有序，用于整理数据顺序，并提供base项
					bedrockNonConvTW,	// 无序，部分资源包内容，不包含base项
					commonConvTW,
					crossConvTW,
					bedrockPatchConvTW,
					(patchObj.common) ? patchObj.common.tw : {},
					(patchObj.cross) ? patchObj.cross.tw : {},
					(patchObj.bedrock) ? patchObj.bedrock.tw : {}
				)
			})
		)
	}
	Promise.all(convertTask).then(function(){
		// 输出 Java 客户端语言文件
		for (const namespace in javaCN) {
			autoOut("./output/" + mainPackName + "/assets/" + namespace + "/lang/zh_cn.json", JSON.stringify(javaCN[namespace]));
		}
		for (const namespace in javaHK) {
			autoOut("./output/" + mainPackName + "/assets/" + namespace + "/lang/zh_hk.json", JSON.stringify(Object.assign(javaCN[namespace],javaHK[namespace])));
		}
		for (const namespace in javaTW) {
			autoOut("./output/" + mainPackName + "/assets/" + namespace + "/lang/zh_tw.json", JSON.stringify(Object.assign(javaCN[namespace],javaTW[namespace])));
		}
		// 输出 Geyser 专用语言文件
		autoOut("./output/" + mainPackName + "/overrides/zh_tw.json", JSON.stringify(geyserTW));
		// 输出基岩客户端语言文件
		autoOut("./output/" + mainPackName + "/texts/zh_TW.lang", langStr(bedrockTW));
	});
}

module.exports = {process};