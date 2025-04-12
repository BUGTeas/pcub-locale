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

// 覆盖其它命名空间中的重复键
const dupKeyInOtherNs = function(target, prossedObj) {
	// 遍历键
	for (const key in prossedObj) {
		let duplicated = false;
		for (const testNs in target) if (target[testNs][key]) {
			// 如果其它命名空间中存在同样的键
			duplicated = true;
			target[testNs][key] = prossedObj[key];
		}
		if (duplicated) delete prossedObj[key]; // 删除补丁中的重复键
	}
}

// 主处理
const process = async function (...packNameList) {
	// 整个实例下的对象
	const bedrockEN = new Object();
	const bedrockCN = new Object();
	const bedrockTW = new Object();
	const geyserEN = new Object();
	const geyserCN = new Object();
	const geyserTW = new Object();
	const bedrockNonConvTW = new Object();
	const geyserNonConvTW = new Object();
	// {命名空间: {键名: 键值}}
	const javaCN = new Object();
	const javaTW = new Object();
	const javaHK = new Object();
	// 异步执行
	const asyncTask = [];

	const mainPackName = packNameList[0];
	// 遍历资源包
	for (const packIndex in packNameList) {
		const packName = packNameList[packIndex];
		const packRoot = "./resources/" + packName + "/assets/";
		const packObj = new Object();
		// 异步执行
		const convertTask = [];
		// 读取资源包
		let dirList = [];
		try { dirList = fs.readdirSync(packRoot); } catch (e) {}
		console.log(`资源包 “${packName}” 的命名空间读取顺序为：${dirList}`);
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
			if (!javaCN[namespace]) javaCN[namespace] = packNsObj;
			else Object.assign(javaCN[namespace], packNsObj);
			// 遍历键
			for (const key in packNsObj) {
				const value = packNsObj[key];
				const outputNsList = [namespace]; // 繁体转换目标命名空间列表

				// 防止其它命名空间中存在不同值的同一键，以免客户端显示错误内容
				for (const testNs in javaCN) {
					if (testNs == namespace) continue; // 遇到同命名空间，跳过
					// 如果其它命名空间中存在同样的键
					const testVal = javaCN[testNs][key];
					if (testVal) {
						console.warn(
							`“${namespace}” 中的键 “${key}” 也存在于 “${testNs}” 中！`,
							(testVal == value) ? "值相同" : `由 ${JSON.stringify(testVal)} 覆盖为 ${JSON.stringify(value)}`
						)
						javaCN[testNs][key] = value; // 覆盖重复键
						outputNsList.push(testNs); // 供繁体转换遍历
					}
				}

				// 输出到基岩
				const preseted = presetBedrock(key, value); // 额外处理
				if (namespace == "minecraft") bedrockCN[key] = preseted;
				geyserCN[key] = preseted;

				// 繁体转换
				if (OpenCC) {
					convertTask.push(
						conv_s2tw.convertPromise(value).then( converted => {
							for (const i in outputNsList) {
								const namespace = outputNsList[i];
								if (!javaTW[namespace]) javaTW[namespace] = {};
								javaTW[namespace][key] = converted;
							}
							// 如果基岩的值和Java相同，直接使用Java的转换结果
							if (preseted == value) {
								if (namespace == "minecraft") bedrockNonConvTW[key] = converted;
								geyserNonConvTW[key] = converted;
							}
						} ),
						conv_s2hk.convertPromise(value).then( converted => {
							for (const i in outputNsList) {
								const namespace = outputNsList[i];
								if (!javaHK[namespace]) javaHK[namespace] = {};
								javaHK[namespace][key] = converted;
							}
						} )
					)
					// 如果基岩的值和Java不同，单独转换
					if (preseted != value) convertTask.push(
						conv_s2tw.convertPromise(preseted).then( converted => {
							if (namespace == "minecraft") bedrockNonConvTW[key] = converted;
							geyserNonConvTW[key] = converted;
						} )
					);
				}
			}
		}

		// 补丁文件
		const commonConvHK = new Object();
		const commonConvTW = new Object();
		const javaPatchCN = new Object();
		const javaPatchConvHK = new Object();
		const javaPatchConvTW = new Object();
		const crossConvTW = new Object();
		const geyserPatchConvTW = new Object();
		const bedrockPatchConvTW = new Object();
		
		let patchObj = {};
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
				convertTask.push(
					conv_s2hk.convertPromise(preseted).then( converted => {
						javaPatchConvHK[key] = converted;
					} ),
					conv_s2tw.convertPromise(preseted).then( converted => {
						javaPatchConvTW[key] = converted;
					} )
				)
			}
			// 合并
			const javaPatchOut = Object.assign({},javaPatchCN);
			dupKeyInOtherNs(javaCN, javaPatchOut); // 使用补丁覆盖
			if (javaCN.pcub) Object.assign(javaCN.pcub, javaPatchOut);
			else javaCN.pcub = javaPatchOut;
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
			Object.assign(geyserEN,
				(patchObj.common) ? patchObj.common.fallback : {},
				(patchObj.cross) ? patchObj.cross.fallback : {},
				patchObj.geyser.fallback
			);
			// 繁体转换
			if (OpenCC) for (const key in patchObj.geyser.conversion) {
				const preseted = patchObj.geyser.conversion[key];
				convertTask.push(
					conv_s2tw.convertPromise(preseted).then( converted => {
						geyserPatchConvTW[key] = converted;
					} )
				)
			}
		}

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
			Object.assign(bedrockEN,
				(patchObj.common) ? patchObj.common.fallback : {},
				(patchObj.cross) ? patchObj.cross.fallback : {},
				patchObj.bedrock.fallback
			);
			// 繁体转换
			if (OpenCC) for (const key in patchObj.bedrock.conversion) {
				const preseted = patchObj.bedrock.conversion[key];
				convertTask.push(
					conv_s2tw.convertPromise(preseted).then( converted => {
						bedrockPatchConvTW[key] = converted;
					} )
				)
			}
		}
		
		// 通用繁体转换
		// 互通通用
		if (patchObj.cross && OpenCC) for (const key in patchObj.cross.conversion) {
			const preseted = patchObj.cross.conversion[key];
			convertTask.push(
				conv_s2tw.convertPromise(preseted).then( converted => {
					crossConvTW[key] = converted;
				} )
			)
		};
		// 全部通用
		if (patchObj.common && OpenCC) for (const key in patchObj.common.conversion) {
			const preseted = patchObj.common.conversion[key];
			convertTask.push(
				conv_s2hk.convertPromise(preseted).then( converted => {
					commonConvHK[key] = converted;
				} ),
				conv_s2tw.convertPromise(preseted).then( converted => {
					commonConvTW[key] = converted;
				} )
			)
		};

		asyncTask.push(
			Promise.all(convertTask).then(function(){
				// 合并到 Java 客户端
				if (patchObj.java) {
					const javaPatchTW = Object.assign({},
						javaPatchCN, // 继承简体的键顺序
						(patchObj.common) ? patchObj.common.base : {},
						commonConvTW,
						(patchObj.common) ? patchObj.common.tw : {},
						(patchObj.java) ? patchObj.java.base : {},
						javaPatchConvTW,
						(patchObj.java) ? patchObj.java.tw : {}
					)
					const javaPatchOut = Object.assign({},javaPatchTW);
					dupKeyInOtherNs(javaTW, javaPatchOut); // 使用补丁覆盖
					if (javaTW.pcub) Object.assign(javaTW.pcub, javaPatchOut);
					else javaTW.pcub = javaPatchOut;

					const javaPatchHK = Object.assign({},
						javaPatchTW, // 继承了台繁
						(patchObj.common) ? patchObj.common.base : {},
						commonConvHK,
						(patchObj.common) ? patchObj.common.hk : {},
						(patchObj.java) ? patchObj.java.base : {},
						javaPatchConvHK,
						(patchObj.java) ? patchObj.java.hk : {}
					)
					dupKeyInOtherNs(javaHK, javaPatchHK); // 使用补丁覆盖
					if (javaHK.pcub) Object.assign(javaHK.pcub, javaPatchHK);
					else javaHK.pcub = javaPatchHK;
				}
				// 合并到 Geyser 专用
				Object.assign(geyserTW,
					geyserCN,        // 继承简体的键顺序
					geyserNonConvTW, // 资源包内容
					(patchObj.common) ? patchObj.common.base : {},
					commonConvTW,
					(patchObj.common) ? patchObj.common.tw : {},
					(patchObj.cross) ? patchObj.cross.base : {},
					crossConvTW,
					(patchObj.cross) ? patchObj.cross.tw : {},
					(patchObj.geyser) ? patchObj.geyser.base : {},
					geyserPatchConvTW,
					(patchObj.geyser) ? patchObj.geyser.tw : {}
				)
				// 合并到基岩客户端
				Object.assign(bedrockTW,
					bedrockCN,        // 继承简体的键顺序
					bedrockNonConvTW, // 部分资源包内容
					(patchObj.common) ? patchObj.common.base : {},
					commonConvTW,
					(patchObj.common) ? patchObj.common.tw : {},
					(patchObj.cross) ? patchObj.cross.base : {},
					crossConvTW,
					(patchObj.cross) ? patchObj.cross.tw : {},
					(patchObj.bedrock) ? patchObj.bedrock.base : {},
					bedrockPatchConvTW,
					(patchObj.bedrock) ? patchObj.bedrock.tw : {}
				)
			})
		)
	}
	Promise.all(asyncTask).then(function(){
		// 输出 Java 客户端语言文件
		const javaOut = Object.assign({}, javaCN)
		// 简体
		for (const namespace in javaOut) {
			autoOut("./output/" + mainPackName + "/assets/" + namespace + "/lang/zh_cn.json",
				JSON.stringify(javaOut[namespace]));
		}
		// 台繁
		for (const namespace in javaOut) {
			autoOut("./output/" + mainPackName + "/assets/" + namespace + "/lang/zh_tw.json",
				JSON.stringify(Object.assign(javaOut[namespace], // 继承简体的键顺序
					javaTW[namespace])));
		}
		// 港繁
		for (const namespace in javaOut) {
			autoOut("./output/" + mainPackName + "/assets/" + namespace + "/lang/zh_hk.json",
				JSON.stringify(Object.assign(javaOut[namespace], // 此时已将台繁并入，即作为港繁的后备，也继承键顺序
					javaHK[namespace])));
		}
		// 输出 Geyser 专用语言文件
		autoOut("./output/" + mainPackName + "/overrides/en_us.json", JSON.stringify(geyserEN));
		autoOut("./output/" + mainPackName + "/overrides/zh_cn.json", JSON.stringify(geyserCN));
		autoOut("./output/" + mainPackName + "/overrides/zh_tw.json", JSON.stringify(geyserTW));
		// 输出基岩客户端语言文件
		autoOut("./output/" + mainPackName + "/texts/en_US.lang", langStr(bedrockEN));
		autoOut("./output/" + mainPackName + "/texts/zh_CN.lang", langStr(bedrockCN));
		autoOut("./output/" + mainPackName + "/texts/zh_TW.lang", langStr(bedrockTW));
	});
}

module.exports = {process};