---
layout:     post
title:      React Native 技术详解 (九) - 私有化多APP打包方案
subtitle:   React Native 技术详解 (九) - 私有化多APP打包方案
date:       2022-07-15
author:     SkioFox
header-img: img/post-bg-alibaba.jpg
catalog: true
tags:
- React Native
- 打包
- 私有化
---

## 背景

由于公司的项目需要，越来越多的客户有私有化需求，私有化的App有定制化icon、启动图、上架等需求。因此需要将React Native项目的APP打包成不同的App已满足客户的私有化需求，这里记录下方案实现过程。

这里我们的主要需要解决的问题是：

1. 打包过程资源每次的重复替换(如icon、启动页、证书、描述文件、签名等)
2. 目前的单APP状态，私有化的原生端改动都是一次性的(比如ios端原生配置\android端原生配置\热更新的配置)

通过调研和ios/android原生的打包过程，ios端通过Target、android端通过productFlavor多渠道可以实现多APP的构建过程。

整体方案如下：

![](/img/2022-07-15/01.png)

核心就是需要完成ios中xcode中多target的配置，以及android多渠道配置。

核心流程如下：

![](/img/2022-07-15/02.png)


参考文档：

https://juejin.cn/post/6844903560962899975

https://www.jianshu.com/p/b051f9f083bf

https://juejin.cn/post/6844903844556587015

https://juejin.cn/post/6844904072131117063