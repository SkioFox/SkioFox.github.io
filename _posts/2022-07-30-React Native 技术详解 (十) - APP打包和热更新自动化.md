---
layout:     post
title:      React Native 技术详解 (十) - APP打包和热更新自动化
subtitle:   React Native 技术详解 (十) - APP打包和热更新自动化
date:       2022-07-30
author:     SkioFox
header-img: img/post-bg-alibaba.jpg
catalog: true
tags:
- React Native
- 自动化
- 热更新
- 打包
- code-push
---

## 背景

为了提高APP开发过程的整体效率，摆脱开发人员手动依赖，因此需要搭建一套能支持APP自动打包构建和热更新推送的可视化工具，简化打包和热更新过程，并实现打包以及热更新的自动化。

整体要功能实现需分为以下三步：

- 打包和热更新自动化平台搭建
- 私有化App的打包
- IOS和Android端的打包自动化

## 打包和热更新自动化平台搭建

前面我们已经详细讲过[code-push更新的接入](https://blog.skiofox.top/2022/06/30/React-Native-%E6%8A%80%E6%9C%AF%E8%AF%A6%E8%A7%A3-(%E5%85%AB)-%E9%9B%86%E6%88%90Code-push%E7%83%AD%E6%9B%B4%E6%96%B0/), 这里我们主要需要实现打包的平台化。

1.平台搭建

由于IOS端打包需要强依赖MacOS，因此我们选择一台macOS作为打包服务器。打包过程比较复杂，对原生ios/android环境依赖性比较强，本地需要完成比较复杂的配置。
参考打包方案设计：[来访多APP构建打包方案(IOS+Android)](https://blog.skiofox.top/2022/07/15/React-Native-%E6%8A%80%E6%9C%AF%E8%AF%A6%E8%A7%A3-(%E4%B9%9D)-%E7%A7%81%E6%9C%89%E5%8C%96%E5%A4%9AAPP%E6%89%93%E5%8C%85%E6%96%B9%E6%A1%88/)
热更新：热更新推送是基于code-push，只需通过命令行手动触发，相对比较简单。

通过调研Jenkins工具，可以很好实现在本机上实现界面化的CI/CD管理，通过配置脚本任务准确执行打包和热更新过程，基本流程如下：

![alt text](/img/2022-07-30/01.png)

### 方案核心逻辑：

1.  利用mac电脑作为服务器搭建RN的ios/android打包环境；
2.  ios利用xcode和fastlane工具、android利用gradle完成打包过程；
3.  利用jenkins配置流水线和脚本任务；
4.  jenkins脚本触发来访app自定义脚本完成打包和热更新推送;
5.  利用jenkins插件分发ipa或者apk文件上传蒲公英/生成安装二维码(二期优化)；

### 安装并配置Jenkins

1. 准备前提：mac上安装homebrew和java jdk1.8，可通过查看版本验证是否安装成功

![](/img/2022-07-30/02.png)

2.推荐使用brew安装Jenkins便于后期管理

```bash
brew install Jenkins
```

注意：安装过程可能会遇到网络问题(配置代理解决)或者brew更新问题(取决于brew版本和mac电脑google解决)

安装成功提示

![](/img/2022-07-30/03.png)

```bash
brew services start jenkins
```

3.启动并在浏览器直接打开[http://localhost:8080/](http://10.11.45.1:8080/)，按照推荐初始化jenkins并创建管理员账号进入主页。

![](/img/2022-07-30/04.png)

![](/img/2022-07-30/05.png)

4\. 设置jenkins全局变量(如需要配置开启自启动和更改端口)

```bash
// 查看mac服务器环境变量
echo $path
```

进入jenkins=>系统管理-系统配置-全局属性-环境变量

![](/img/2022-07-30/06.png)

5.创建流水线任务(来访登记APP—打包(同步公有云版本)例)

新建Jenkins任务

![](/img/2022-07-30/07.png)

进行参数化配置

![](/img/2022-07-30/08.png)

配置shell脚本(执行打包的配置)

![](/img/2022-07-30/09.png)

6\. 核心脚本实现

```js
/**
 * app热更新
 * 1. 重置本地代码状态并拉取最新代码
 * 2. 更新js依赖
 * 3. 选择热更新app
 * 4. 选择热更新环境
 * 4. 更新内容描述
 * 5. 执行热更新
 */
 const { promiseSpawn, codepushUpdateMap, judgeHotUpdateArgs } = require('./utils');

 const argv = process.argv.splice(2);
 const appType = argv[0];
 const appPlatform = argv[1];
 const appEnv = argv[2];
 const desc = argv[3] || `版本功能更新`;

const run = async() => {
  if(judgeHotUpdateArgs(argv)) {
    try {
      const cmd = `${codepushUpdateMap[appType][appPlatform][appEnv]} ${desc}`

      console.log(`热更新命令:${cmd}`)

      const resBuild = await promiseSpawn(cmd)
      if(resBuild) {
        console.log(`热更新成功${appType}-${appPlatform}-${appEnv}`)
      }
      console.log(`热更新命令:${cmd}`)
    } catch (err) {
      console.log(`热更新失败${err}`)
    }
  }
}

run();
```
```js
/**
 * app打包
 * 1. 重置本地代码状态并拉取最新代码
 * 2. 更新js依赖
 * 3. 指定APP(比如yunke、jindi、aoyuan...)
 * 4. 更新域名
 * 5. 选择app打包类型(ios/android)
 * 6. 选择app打包环境(test/prod)
 * 7. 安装更新原生依赖库(ios需要)
 * 8. 执行打包
 */
const { judgeArgs, promiseSpawn, buildAppCmdMap } = require('./utils');

const argv = process.argv.splice(2);
const appType = argv[0];
const appPlatform = argv[1];
const appEnv = argv[2];

const run = async() => {
  if(judgeArgs(argv)) {
    try {
      const resBuild = await promiseSpawn(buildAppCmdMap[appType][appPlatform][appEnv])
      if(resBuild) {
        console.log(`app打包成功${appType}-${appPlatform}-${appEnv}`)
        console.log(`app打包命令:${buildAppCmdMap[appType][appPlatform][appEnv]}`)
        let appStorageDir = ''
        const outputsDir = `/Users/Shared/msdj-app/${appPlatform}`
        if(appPlatform === 'ios') {
          appStorageDir = `./ios/fastlane/build/${appType}`
        }else {
          appStorageDir=`./android/app/build/outputs/apk/${appType}`
        }
        try {
          const copy = await promiseSpawn(`cp -rf ${appStorageDir} ${outputsDir}`)
          if(copy) {
            console.log(`app存储目录如下：${outputsDir}/${appType}`)
          }
        } catch (err) {
          console.log(`app文件copy失败${err}`)
        }
      }
    } catch (err) {
      console.log(`app打包失败${err}`)
    }
  }
}

run();
```

这里只列举了核心逻辑，ios和android打包的前置工作以及code-push接入需要你提前完成。

最终效果如下：

![](/img/2022-07-30/11.png)

实现了打包和热更新的自动化和平台化。

参考文档：

[https://www.jenkins.io/zh/doc/pipeline/tour/getting-started/](https://www.jenkins.io/zh/doc/pipeline/tour/getting-started/)

[https://juejin.cn/post/6931966634907320333](https://juejin.cn/post/6931966634907320333)

[https://juejin.cn/post/7045512176139763743](https://juejin.cn/post/7045512176139763743)

[https://www.jenkins.io/download/lts/macos/](https://www.jenkins.io/download/lts/macos/)

[https://stackoverflow.com/questions/64520921/how-to-change-default-port-for-brew-installed-jenkins-in-macos](https://stackoverflow.com/questions/64520921/how-to-change-default-port-for-brew-installed-jenkins-in-macos)

[https://blog.csdn.net/wbk0905/article/details/127057266](https://blog.csdn.net/wbk0905/article/details/127057266)

[https://www.jianshu.com/p/15c4941f8ae9](https://www.jianshu.com/p/15c4941f8ae9)

