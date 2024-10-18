---
layout:     post
title:      microApp微前端下sdk隔离
subtitle:   microApp微前端下sdk隔离
date:       2024-01-23
author:     SkioFox
header-img: img/post-bg-ios9-web.jpg
catalog: true
tags:
- 微前端
- microApp
---

## 背景

### sdk 作用是什么？
  
给用户提供一组可以简单调用的基础api，方便用户直接使用，降低使用难度

一般为了考虑sdk的的维护性与易用性，直接提供通过外链引入的sdk的方式，而这种外链sdk一般是umd的模块结构，也就是说最终加载完成之后，会在`window`上挂载一些属性

以百度地图sdk 3.0版本为例

```typescript
<div id='baidu_map'></div>
<script src='https://api.map.baidu.com/api?v=3.0&ak=${ak}&callback=_initBaiduMap'></script>

  
// 直接调用百度sdk提供的全局方法
const map = new BMap.Map('baidu_map')

// 添加默认缩放平移控
map.addControl(new BMap.NavigationControl())

// 启用滚轮放大缩小，默认禁用
map.enableScrollWheelZoom()
```

很多sdk都是类似的使用方式，总结一下sdk加载完之后，一般做的事情

+ 通过给点的dom节点，进行渲染
+ 获取dom并绑定事件
+ 往`document`、`window`上绑定事件

知道了sdk的作用，那么在微前端场景为什么要做sdk隔离，那是因为同一个sdk会存在不同的大版本，比如百度地图1.0、2.0、3.0且版本之间不兼容，各个业务组之间可能使用同一个sdk的不同版本，如果不隔离都放到全局会造成覆盖，在多页面这种场景下会导致问题

所以sdk有必要做隔离

### 为什么没法在子应用中直接隔离？

因为微前端场景下，是通过`fetch`来获取子应用的js资源，其中就包括sdk，而第三方sdk提供者都是没有设置`cors`的，所以这就导致了无法通过`fetch`获取到资源，以迅雷sdk与百度地图sdk为例

#### 加载迅雷sdk

```typescript
<script src="//open.thunderurl.com/thunder-link.js" ></script>

const download = () => {
  const tasks = [
    {
      name: '刘嫣然.zip',
      url: "https://gateway-test.myscrm.cn/trade-sak/app/get-signature-url-by-code-and-path?code=trade-center&path=27/trade-center/fangzhiadmin_test/f8311c3f-7e98-4841-b138-33d4c9498f3b.zip",
    }
  ]
  // 调用迅雷sdk提供的api
  window.thunderLink.newTask({
    tasks,
  });
}
```

结果出现跨域错误，虽然跨域错误的不是`thunder-link.js`这个入口js文件，但是最终还是这个sdk内关联的静态资源无法通过fetch获取，如下图所示

![](/img/2024-01-23/01.png)

#### 加载百度地图sdk

```typescript
<div id='baidu_map'></div>
<script src='https://api.map.baidu.com/api?v=3.0&ak=${ak}&callback=_initBaiduMap'></script>

  
// 直接调用百度sdk提供的全局方法
const map = new BMap.Map('baidu_map')
```

结果出现跨域错误，跨域错误直接出现在入口链接上，如下图所示

![](/img/2024-01-23/02.png)

既然第三方sdk提供者不会设置`cors`，那么把sdk全部先下载下来，然后放到本地加载，不就可以避免跨域了吗？这样会带来两个问题

+ 一般sdk内部都有动态加载其它sdk相关的js文件
+ sdk代码是不断更新的，这就导致了全部拷贝下来，可能会导致问题

不能拷贝下来，那就自己做一层转发，先转发到我们自己的服务器，由服务器在转发到真正的sdk地址，这样虽然可以跳过跨越的问题，但是sdk一多之后会带来其它的问题，并且这种思路有待验证

除了上述两种思路，那么还有没有其它的思路，有

可以通过在`iframe`内加载sdk，然后到达sdk隔离的目的，因为`iframe`自带硬隔离，并且同源`iframe`，是可以直接操作父窗口dom等等api的

通过`iframe`加载sdk，虽然解决了隔离的问题，但是会面临如下问题

+ 子应用中怎么访问到`iframe`中的变量
+ 怎么准确获取dom
+ 怎么绑定事件，让事件正常触发

## 实现iframe sdk能力

上面已经知道了，有什么问题，那么这些问题怎么解决呢？如下所示

**子应用中怎么访问到iframe中的变量**

将`iframe`中sdk添加的属性，同步到子应用的代理`window`对象上

**怎么准确获取dom**

劫持`iframe`内的`querySelector`等api，使用基座的`document`获取到dom

**怎么绑定事件，让事件正常触发**

劫持`iframe`内的`window.addEventListener、docuemt.addEventListener、document.body.addEventListener`等事件，将这些事件绑定到代理对象的`window`与基座的`document`及基座的`document.body` 上，这些注册在基座上的事件，在iframe被删除的时候，在主动清除

最后在不断的轮询，当`iframe.window`上有属性变化的时候，就将对应的属性及值同步到代理`window`对象上

**概念图如下所示**

![](/img/2024-01-23/03.jpg)

看下具体的代码实现

### 劫持querySelector等方法

```typescript
patchDocument() {
  const appName = this.appName
  const methods = ['querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName', 'getElementsByTagName', 'getElementsByName']

  const iframeWindow = this.iframeWindow
  const app = this.app

  const rawGetElementsByTagName = iframeWindow.Document.prototype.getElementsByTagName
  const rawQuerySelectorAll = iframeWindow.Document.prototype.querySelectorAll
  const rawGetElementsByClassName = iframeWindow.Document.prototype.getElementsByClassName

  const handler = (key: string, context: HTMLElement, type: string) => {
    if (['querySelector', 'getElementById'].some((item) => key === item)) {
      return type === 'script' ? iframeWindow.document.scripts[0] : iframeWindow.document[type]
    }
    const action = (() => {
      if (key === 'getElementsByTagName') {
        return rawGetElementsByTagName
      } else if (key === 'querySelectorAll') {
        return rawQuerySelectorAll
      } else if (key === 'getElementsByClassName') {
        return rawGetElementsByClassName
      } else {
        return rawQuerySelectorAll
      }
    })()
    return action.call(context, type)
  }

  methods.forEach((key) => {
    Object.defineProperty(iframeWindow.Document.prototype, key, {
      get() {
        throttleDeferForSetAppName(appName)
        return function (...args: any[]) {
          if (['head', 'body', 'script'].includes(args[0])) {
            // @ts-ignore
            return handler(key, this, args[0])
          }

          return (window as any).Document.prototype[key].apply(window.document, args)
        }
      }
    })
  })

  const rawAppendChild = iframeWindow.Element.prototype.appendChild
  iframeWindow.Element.prototype.appendChild = function appendChild<T extends Node>(newChild: T | HTMLStyleElement): T {
    // 当插入body or head时，需要判断是script标签还是非script标签，script标签插入iframe的document.body 非script标签需要插入micro-app的body内
    if (this === iframeWindow.document.head || this === iframeWindow.document.body) {
      // link标签跨域无法被劫持，也无法通过js的方式获取到link标签内容，所以目前只能直接插入到子应用的head内
      if (!(['SCRIPT'].some((item) => newChild.tagName === item))) {
        throttleDeferForSetAppName(appName)
        const isHeadEle = this === iframeWindow.document.head
        const selector = isHeadEle ? 'micro-app-head' : 'micro-app-body'
        if (newChild.tagName === 'STYLE') {
          newChild = scopedCSS(newChild as HTMLStyleElement, app)
        }
        const ele = window.document.querySelector(selector) || (isHeadEle ? window.document.head : window.document.body)
        return rawAppendChild.call(ele, newChild)
      }
    }
    return rawAppendChild.call(this, newChild)
  }

  const rawInsertBefore = iframeWindow.Element.prototype.insertBefore
  iframeWindow.Element.prototype.insertBefore = function insertBefore<T extends Node>(newChild: T | HTMLStyleElement, refChild: Node | null): T {
    // 当插入body or head时，需要判断是script标签还是非script标签，script标签插入iframe的document.body 非script标签需要插入micro-app的body内
    if (this === iframeWindow.document.head || this === iframeWindow.document.body) {
      // link标签跨域无法被劫持，也无法通过js的方式获取到link标签内容，所以目前只能直接插入到子应用的head内
      if (!(['SCRIPT'].some((item) => newChild.tagName === item))) {
        throttleDeferForSetAppName(appName)
        const isHeadEle = this === iframeWindow.document.head
        const selector = isHeadEle ? 'micro-app-head' : 'micro-app-body'
        if (newChild.tagName === 'STYLE') {
          newChild = scopedCSS(newChild as HTMLStyleElement, app)
        }
        const ele = window.document.querySelector(selector) || (isHeadEle ? window.document.head : window.document.body)
        return rawAppendChild.call(ele, newChild)
      }
    }
    return rawInsertBefore.call(this, newChild, refChild)
  }

  const rawRemoveChild = iframeWindow.Element.prototype.removeChild
  iframeWindow.Element.prototype.removeChild = function removeChild<T extends Node>(newChild: T | HTMLStyleElement, refChild: Node | null): T {
    // 当插入body or head时，需要判断是script标签还是非script标签，script标签插入iframe的document.body 非script标签需要插入micro-app的body内
    if (this === iframeWindow.document.head || this === iframeWindow.document.body) {
      // link标签跨域无法被劫持，也无法通过js的方式获取到link标签内容，所以目前只能直接插入到子应用的head内
      if (!(['SCRIPT'].some((item) => newChild.tagName === item))) {
        throttleDeferForSetAppName(appName)
        const isHeadEle = this === iframeWindow.document.head
        const selector = isHeadEle ? 'micro-app-head' : 'micro-app-body'
        const ele = window.document.querySelector(selector) || (isHeadEle ? window.document.head : window.document.body)
        return rawRemoveChild.call(ele, newChild)
      }
    }
    return rawRemoveChild.call(this, newChild, refChild)
  }

  this.iframeWindow.document.write = (str: string) => {
    const result = str.match(/<script.*src=['"](.*)['"]><\/script>/)
    if (result && result[1]) {
      const s = this.iframeWindow.document.createElement('script')
      s.src = result[1]
      this.iframeWindow.document.body.appendChild(s)
    }
  }
}
```

### 劫持window、docuemt、document.body上的addEventListener等事件

```typescript
pathEvent() {
  const documentEventListenerMap = new Map()
  const bodyEventListenerMap = new Map()
  const windowEventListenerMap = new Map()
  const proxyWindow = this.proxyWindow
  const appName = this.appName
  const iframeWindow = this.iframeWindow
  const rawAddEventListen = iframeWindow.document.addEventListener
  const rawRemoveEventListener = iframeWindow.document.removeEventListener

  iframeWindow.document.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions | undefined) {
    throttleDeferForSetAppName(appName)
    const listenerList = documentEventListenerMap.get(type)
    if (listenerList) {
      listenerList.add(listener)
    } else {
      documentEventListenerMap.set(type, new Set([listener]))
    }

    window.document.addEventListener(type, listener, options)

    rawAddEventListen.call(this, type, listener, options)
  }

  iframeWindow.document.removeEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions | undefined) {
    throttleDeferForSetAppName(appName)
    const listenerList = documentEventListenerMap.get(type)
    if (listenerList?.size && listenerList.has(listener)) {
      listenerList.delete(listener)
    }
    window.document.removeEventListener(type, listener, options)

    rawRemoveEventListener.call(this, type, listener, options)
  }

  const rawBodyAddEventListen = iframeWindow.document.body.addEventListener
  const rawBodyRemoveEventListener = iframeWindow.document.body.removeEventListener

  iframeWindow.document.body.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions | undefined) {
    throttleDeferForSetAppName(appName)
    const listenerList = bodyEventListenerMap.get(type)
    if (listenerList) {
      listenerList.add(listener)
    } else {
      bodyEventListenerMap.set(type, new Set([listener]))
    }

    window.document.body.addEventListener(type, listener, options)

    rawBodyAddEventListen.call(this, type, listener, options)
  }

  iframeWindow.document.body.removeEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions | undefined) {
    throttleDeferForSetAppName(appName)
    const listenerList = bodyEventListenerMap.get(type)
    if (listenerList?.size && listenerList.has(listener)) {
      listenerList.delete(listener)
    }

    window.document.body.removeEventListener(type, listener, options)

    rawBodyRemoveEventListener.call(this, type, listener, options)
  }

  const rawWindowAddEventListen = iframeWindow.addEventListener
  const rawWindowRemoveEventListener = iframeWindow.removeEventListener

  iframeWindow.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions | undefined) {
    const listenerList = windowEventListenerMap.get(type)
    if (listenerList) {
      listenerList.add(listener)
    } else {
      windowEventListenerMap.set(type, new Set([listener]))
    }
    proxyWindow.addEventListener(type, listener, options)
    rawWindowAddEventListen.call(this, type, listener, options)
  }

  iframeWindow.removeEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions | undefined) {
    const listenerList = windowEventListenerMap.get(type)
    if (listenerList?.size && listenerList.has(listener)) {
      listenerList.delete(listener)
    }
    proxyWindow.removeEventListener(type, listener, options)
    rawWindowRemoveEventListener.call(this, type, listener, options)
  }

  this.releaseEffect = () => {
    // Clear window binding events
    if (documentEventListenerMap.size) {
      documentEventListenerMap.forEach((listenerList, type) => {
        for (const listener of listenerList) {
          window.document.removeEventListener(type, listener)
        }
      })
      documentEventListenerMap.clear()
    }

    if (bodyEventListenerMap.size) {
      bodyEventListenerMap.forEach((listenerList, type) => {
        for (const listener of listenerList) {
          window.document.body.removeEventListener(type, listener)
        }
      })
      bodyEventListenerMap.clear()
    }

    if (windowEventListenerMap.size) {
      windowEventListenerMap.forEach((listenerList, type) => {
        for (const listener of listenerList) {
          proxyWindow.removeEventListener(type, listener)
        }
      })
      windowEventListenerMap.clear()
    }
  }
}
```

### 同步iframe.window上的属性

同步属性的逻辑如下

+ 在创建sdk script之前先获取`iframe.window`上的原始属性
+ 在sdk script加载完成之后，先同步一次属性
+ 最后通过`requestIdleCallback` api重复执行同步属性的逻辑
+ tab页签关闭之后会中断`requestIdleCallback`内的同步属性逻辑

```typescript
// 创建sdk script之前先获取iframe.window上的属性
recordIframeWindowProps () {
  const iframeWindow = this.iframeWindow
  const arr = ['__windowSnapshot__', '__filterSyncKeys__', '_nvc', '__unmounted__', ...(iframeWindow.IGNORE_SYNC_KEYS || [])].map((item) => {
    return [item, item]
  }) as any
  const SYNC_KEYS = (iframeWindow.SYNC_KEYS || []).concat(['onerror'])
  const filterSyncKeys = new Map(arr)
  iter(iframeWindow, function(prop: any) {
    if (SYNC_KEYS.indexOf(prop) !== -1) return
    filterSyncKeys.set(prop, prop)
  })
  // 将windowSnapshot放到iframe自己身上，确保多个iframe同时存在时你不会串key
  iframeWindow.__windowSnapshot__ = new Map() as Record<string, any>
  // filterSyncKeys.concat(iframeWindow.FILTER_SYNC_KEYS || [])
  iframeWindow.__filterSyncKeys__ = filterSyncKeys
}

// 将iframe.window上的属性同步到子应用代理window对象上
function syncIframeWindowPropsToProxyWindow(iframeWindow: Window & Win, proxyWindow: Window | undefined, sandBox: SandBox) {
  if (!sandBox.active) return
  const windowSnapshot = iframeWindow.__windowSnapshot__
  const filterSyncKeys = iframeWindow.__filterSyncKeys__
  iter(iframeWindow, function (prop: any) {
    // 过滤iframe.window上最开始的属性
    if (filterSyncKeys.has(prop)) return
    // 只有没有同步过，或者同步过但是值发生了变化的key，才会进行同步
    if (!windowSnapshot.has(prop) || (windowSnapshot.has(prop) && windowSnapshot.get(prop) !== iframeWindow[prop])) {
      if (proxyWindow) {
        try {
          proxyWindow[prop] = iframeWindow[prop]
          windowSnapshot.set(prop, iframeWindow[prop])
        } catch (error) {}
      }
    }
  })
}

function eventLoop(iframeWindow: Window & Win, proxyWindow: microAppWindowType, sandBox: SandBox) {
  const loop = (deadline: any) => {
    if (deadline.timeRemaining() > 5) {
      syncIframeWindowPropsToProxyWindow(iframeWindow, proxyWindow, sandBox)
      pathElementInnerHTML(iframeWindow, proxyWindow?.__MICRO_APP_NAME__)
    }
    // 保证iframe标签被删除之后能够清除同步函数
    if (!iframeWindow.__unmounted__) {
      requestIdleCallback(loop)
    } else {
      console.log('iframe sdk 已清除')
    }
  }
  return loop
}

```

总结具体流程，如下图所示

![](/img/2024-01-23/04.jpg)

## 结合micro-app创建iframe sdk

### <micro-app />渲染流程

![](/img/2024-01-23/05.jpg)
### 插入iframe sdk之后<micro-app />渲染流程

![](/img/2024-01-23/06.jpg)

从上图可以看出加载静态sdk与加载动态sdk创建`iframe`加载sdk是有很大不同的

**加载静态sdk流程有三种场景**

+ 场景1: 页面第一次渲染，在`loadSource`的过程中创建sdk `iframe`
+ 场景2: 页面第一次渲染，关闭之后重新打开，这时候有app，直接跳到`execScripts`步骤
+ 场景3: 页面第一次渲染，然后在打开同一个应用的另外一个页面，满足模版复用，直接跳到`execScripts`步骤

可以看到场景2与场景3，都跳过了`loadSource`的过程，所以最终为了满足场景2及场景3，修改了scipt.info，增加了sdkLoaded、sdkDefer这样的辅助字段，目的就是保证能够场景2及场景3下，能够正确创建sdk `iframe`及保证sdk之后的js执行顺序

**加载动态sdk流程只有一种场景**

+ 判断动态插入的script是否是外链，且同时是sdk，如果满足则创建sdk `iframe`

## 总结

目前同步属性，对于引用对象只比较了第一层，没有深层次比较，原因是因为目前接入的百度sdk、人机校验sdk、xlxs sdk功能都是正常的，没有出现什么问题，所以暂时不考虑深比较

另外除了属性同步，其实还有另外一种思路，就是在`micro-app`内对于代理`window`对象get的时候，先在代理`window`对象上取值，取不到值就在基座`window`上取值，如果还是取不到值就在`iframe window`上取值，但是这样对`micro-app` app那部分的逻辑侵入有点大，同时也可能导致其它bug，暂不考虑

**最后为什么接入sdk中间出了那么多问题**

+ 代码实现之前本身存在漏洞，比如tab页关闭之后`iframe`没有清除，属性同步错误的key值
+ 场景没有覆盖完全，只考虑了最简单的动态引入sdk，没有考虑静态sdk场景、有依赖关系的多个静态sdk场景、点击同一个菜单，会重新渲染的场景

<font style="color:rgb(36, 41, 47);"></font>

**目前支持的sdk引入方式及场景**

| 方式/场景 | 首次打开 | 关闭之后二次打开 | 左侧菜单二次打开 | 同一个应用同时打开多个页面 | 一个页面多个无关联sdk |
| :---: | :---: | :---: | :---: | :---: | :---: |
| 动态sdk | ✅ | ✅ | ✅ | ✅ | ❌ |
| 静态sdk | ✅ | ✅ | ✅ | ✅ | ❌ |
