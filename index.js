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

// 输出lang格式内容
function langStr(src) {
	let result = "";
	for (const objectKey in src){
		let objectValue = src[objectKey];
		if (objectValue == "") objectValue = " "; // 避免空内容
		else objectValue = JSON.stringify(objectValue).slice(1, -1); // 使用转义符，适合 v1.21.50 后的版本
		result += "\n" + objectKey + "=" + objectValue
	}
	return result.substring(1);
}

// 预处理
function presetBedrock(key, value) {
	//修复秋漏写
	if(key == "pl.info.instance5.end2" && /§6然四圣兽/g.test(value)) value = value.replaceAll("§6然四圣兽", "§6虽然四圣兽");
	//清除进度尾部空格
	if (/^pl.adv./g.test(key) && /.title$/g.test(key)) value = value.substring(0,value.search(/\s*$/g));
	if (/^pl.book./g.test(key) && /_hide_/g.test(key)) {
		value = value.replaceAll("\n", "");
		var headIndex = value.search(/点击/g)
		if (headIndex != -1) value = ((/_hide_mission_item/g.test(key)) ? "" : "\n\n\n") + "§p§l请通过菜单书" + ((key == "pl.book.zhan_hide_mission_item" && /点击谷主/g.test(value)) ? "领取" : "") + value.substring(headIndex + 2) + "。";
	}
	const newValue = value.replaceAll("§m", "⨉") // 将不受基岩客户端支持的删除线替换为前缀
	if (newValue != value) console.warn(`键 “${key}” 的值中存在不受基岩客户端支持的删除线！(§m) ${JSON.stringify(value)}`);
	value = newValue.replaceAll("§n", ""); // 去除不受基岩客户端支持的下划线
	return value;
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
	// {命名空间: {键名: 键值}}
	const javaEN = new Object();
	const javaCN = new Object();
	const javaTW = new Object();
	const javaHK = new Object();
	// 导出包的名称
	const outputPackName = packNameList[packNameList.length - 1];
	// 遍历资源包
	for (const packIndex in packNameList) {
		const packName = packNameList[packIndex];
		const packRoot = "./resources/" + packName + "/assets/";
		const packObj = new Object();
		// 读取资源包
		let dirList = [];
		try { dirList = fs.readdirSync(packRoot); } catch (e) {}
		if (dirList[0]) console.log(`资源包 “${packName}” 的命名空间读取顺序：${dirList.join("、")}`);
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
				javaHK[namespace] = {};
				javaTW[namespace] = {};
			}
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
				const convTW = (OpenCC) ? conv_s2tw.convertSync(value) : value;
				const convHK = (OpenCC) ? conv_s2hk.convertSync(value) : value;
				outputNsList.forEach((outputNs) => {
					javaTW[outputNs][key] = convTW;
					javaHK[outputNs][key] = convHK;
				});
				// 如果基岩的值和Java相同，直接使用Java的转换结果，否则单独转换
				const convPres = (preseted == value || !OpenCC) ? convTW : conv_s2tw.convertSync(preseted);
				if (namespace == "minecraft") bedrockTW[key] = convPres;
				geyserTW[key] = convPres;
			}
		}

		// 补丁文件
		const commonConvHK = new Object();
		const commonConvTW = new Object();
		const crossConvTW = new Object();
		
		let patchObj = {};
		try { patchObj = JSON.parse(fs.readFileSync("./patch/" + packName + ".json")); } catch (e) {}
		
		// 通用繁体转换
		// 互通通用
		if (patchObj.cross) {
			if (OpenCC) for (const key in patchObj.cross.conversion)
				crossConvTW[key] = conv_s2tw.convertSync(patchObj.cross.conversion[key]);
		}
		// 全部通用
		if (patchObj.common) {
			if (OpenCC) for (const key in patchObj.common.conversion) {
					const conversion = patchObj.common.conversion[key];
					commonConvHK[key] = conv_s2hk.convertSync(conversion);
					commonConvTW[key] = conv_s2tw.convertSync(conversion);
				}
		}

		// Java 客户端
		// 覆盖顺序：common.base < common.conversion < java.base < java.conversion < common.conversion(转为台繁) < common.tw < java.conversion(转为台繁) < java.tw < common.conversion(转为港繁) < common.hk < java.conversion(转为港繁) < java.hk
		if (patchObj.java) {
			// 简体
			const patch = Object.assign({}, 
				... (patchObj.common) ? [patchObj.common.base, patchObj.common.conversion] : [],
				patchObj.java.base,
				patchObj.java.conversion
			);
			const expCN = Object.assign({}, patch);
			dupKeyInOtherNs(javaCN, expCN); // 使用补丁覆盖
			if (javaCN.pcub) Object.assign(javaCN.pcub, expCN);
			else javaCN.pcub = expCN;

			// 繁体转换
			const convHK = new Object();
			const convTW = new Object();
			if (OpenCC) for (const key in patchObj.java.conversion) {
					const conversion = patchObj.java.conversion[key];
					convHK[key] = conv_s2hk.convertSync(conversion);
					convTW[key] = conv_s2tw.convertSync(conversion);
				}

			// 台繁
			Object.assign(patch, // 继承简体
				... (patchObj.common) ? [(OpenCC) ? commonConvTW : patchObj.common.conversion, patchObj.common.tw] : [],
				(OpenCC) ? convTW : patchObj.java.conversion,
				patchObj.java.tw
			);
			const expTW = Object.assign({}, patch);
			dupKeyInOtherNs(javaTW, expTW); // 使用补丁覆盖
			if (javaTW.pcub) Object.assign(javaTW.pcub, expTW);
			else javaTW.pcub = expTW;

			// 港繁
			Object.assign(patch, // 继承台繁
				... (patchObj.common) ? [(OpenCC) ? commonConvHK : patchObj.common.conversion, patchObj.common.hk] : [],
				(OpenCC) ? convHK : patchObj.java.conversion,
				patchObj.java.hk
			);
			const expHK = Object.assign({}, patch);
			dupKeyInOtherNs(javaHK, expHK); // 使用补丁覆盖
			if (javaHK.pcub) Object.assign(javaHK.pcub, expHK);
			else javaHK.pcub = expHK;

			// 后备
			if (!javaEN.pcub) javaEN.pcub = {};
			Object.assign(javaEN.pcub,
				... (patchObj.common) ? [patchObj.common.fallback] : [],
				patchObj.java.fallback
			);
		}

		// Geyser 专用
		// 覆盖顺序：common.base < common.conversion < cross.base < cross.conversion < geyser.base < geyser.conversion < common.conversion(转为台繁) < common.tw < cross.conversion(转为台繁) < cross.tw < geyser.conversion(转为台繁) < geyser.tw
		if (patchObj.geyser) {
			// 简体
			const patch = Object.assign({},
				... (patchObj.common) ? [patchObj.common.base, patchObj.common.conversion] : [],
				... (patchObj.cross) ? [patchObj.cross.base, patchObj.cross.conversion] : [],
				patchObj.geyser.base,
				patchObj.geyser.conversion
			);
			Object.assign(geyserCN, patch);
			
			// 繁体转换
			const convTW = new Object();
			if (OpenCC) for (const key in patchObj.geyser.conversion)
				convTW[key] = conv_s2tw.convertSync(patchObj.geyser.conversion[key]);

			// 台繁
			Object.assign(patch,
				... (patchObj.common) ? [(OpenCC) ? commonConvTW : patchObj.common.conversion, patchObj.common.tw] : [],
				... (patchObj.cross) ? [(OpenCC) ? crossConvTW : patchObj.cross.conversion, patchObj.cross.tw] : [],
				(OpenCC) ? convTW : patchObj.geyser.conversion,
				patchObj.geyser.tw
			);
			Object.assign(geyserTW, patch);

			// 后备
			Object.assign(geyserEN,
				... (patchObj.common) ? [patchObj.common.fallback] : [],
				... (patchObj.cross) ? [patchObj.cross.fallback] : [],
				patchObj.geyser.fallback
			);
		}

		// 基岩客户端
		// 覆盖顺序：common.base < common.conversion < cross.base < cross.conversion < bedrock.base < bedrock.conversion < common.conversion(转为台繁) < common.tw < cross.conversion(转为台繁) < cross.tw < bedrock.conversion(转为台繁) < bedrock.tw
		if (patchObj.bedrock) {
			// 简体
			const patch = Object.assign({},
				... (patchObj.common) ? [patchObj.common.base, patchObj.common.conversion] : [],
				... (patchObj.cross) ? [patchObj.cross.base, patchObj.cross.conversion] : [],
				patchObj.bedrock.base,
				patchObj.bedrock.conversion
			);
			Object.assign(bedrockCN, patch);

			// 繁体转换
			const convTW = new Object();
			if (OpenCC) for (const key in patchObj.bedrock.conversion)
				convTW[key] = conv_s2tw.convertSync(patchObj.bedrock.conversion[key]);

			// 台繁
			Object.assign(patch,
				... (patchObj.common) ? [(OpenCC) ? commonConvTW : patchObj.common.conversion, patchObj.common.tw] : [],
				... (patchObj.cross) ? [(OpenCC) ? crossConvTW : patchObj.cross.conversion, patchObj.cross.tw] : [],
				(OpenCC) ? convTW : patchObj.bedrock.conversion,
				patchObj.bedrock.tw
			);
			Object.assign(bedrockTW, patch);

			// 后备
			Object.assign(bedrockEN,
				... (patchObj.common) ? [patchObj.common.fallback] : [],
				... (patchObj.cross) ? [patchObj.cross.fallback] : [],
				patchObj.bedrock.fallback
			);
		}
	}

	// 导出文件
	// Java 客户端
	for (const namespace in javaEN) {
		autoOut("./output/" + outputPackName + "/assets/" + namespace + "/lang/en_us.json", JSON.stringify(javaEN[namespace]));
	}
	for (const namespace in javaCN) {
		autoOut("./output/" + outputPackName + "/assets/" + namespace + "/lang/zh_cn.json", JSON.stringify(javaCN[namespace]));
		autoOut("./output/" + outputPackName + "/assets/" + namespace + "/lang/zh_tw.json", JSON.stringify(javaTW[namespace]));
		autoOut("./output/" + outputPackName + "/assets/" + namespace + "/lang/zh_hk.json", JSON.stringify(javaHK[namespace]));
	}
	// Geyser 专用
	autoOut("./output/" + outputPackName + "/overrides/en_us.json", JSON.stringify(geyserEN));
	autoOut("./output/" + outputPackName + "/overrides/zh_cn.json", JSON.stringify(geyserCN));
	autoOut("./output/" + outputPackName + "/overrides/zh_tw.json", JSON.stringify(geyserTW));
	// 基岩客户端
	autoOut("./output/" + outputPackName + "/texts/en_US.lang", langStr(bedrockEN));
	autoOut("./output/" + outputPackName + "/texts/zh_CN.lang", langStr(bedrockCN));
	autoOut("./output/" + outputPackName + "/texts/zh_TW.lang", langStr(bedrockTW));
}

module.exports = {process};