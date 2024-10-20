---
layout:     post
title:      github action做CI/CD记录
subtitle:   github action做CI/CD记录
date:       2024-08-25
author:     SkioFox
header-img: img/home-bg-geek.jpg
catalog: true
tags:
- CI/CD
---


先回顾下什么是CI/CD
========

*   `CI`，Continuous Integration，持续集成。
*   `CD`，Continuous Deployment，持续部署。

CI/CD一般配合起来用，从开发、测试到上线的过程中，借助于 CI/CD 进行一些自动化处理，保障项目质量。CI/CD一般与git一起用，可以简单理解为在git上挂载了一些hook，当代码push到git仓库以后，触发了预先写好的hook钩子，仓库中的代码会被自动执行预先写好的工作流脚本，自动编译和自动化测试，这个过程就是CI，目的是确认提交的代码变动能否能正确集成。集成完成后，持续交付可以自动将已验证的代码发布到服务器上。

CI/CD好处
======

*   功能分支提交后，通过 CI/CD 进行自动化测试、语法检查等，**如未通过 CI/CD，则无法 CodeReview，更无法合并到生产环境分支进行上线**
*   功能分支提交后，通过 CI/CD 检查 npm 库的风险、检查构建镜像容器的风险等
*   功能分支提交后，通过 CI/CD 对当前分支代码构建独立镜像并生成独立的分支环境地址进行测试，**如对每一个功能分支生成一个可供测试的地址**
*   功能分支测试通过后，合并到主分支，自动构建镜像并部署到生成环境 (一般生成环境需要手动触发、自动部署)

CI/CD 工具
-------

`CI/CD` 集成于 CI/CD 工具及代码托管服务。CI/CD 有时也可理解为进行 CI/CD 的构建服务器，而提供 CI/CD 的服务一般公司有用到jenkins也有公司会用travis CI，这两个工具一般会集成到github/gitlab中一起使用。

如果公司用gitLab作为CI/CD工具，一般也需要自建一个gitlab Runner作为构建服务器
<!-- ，明源云有一套成熟的解决方案——mars -->

摒弃刀耕火种从github action开始
======================

一般规范的公司有一套成熟的devOps工具，里面集成了CI/CD的解决方案，这里只是用用github action来讲解一个完整的CI/CD流程。

并不是说其他的CI/CD工具没有github action好，只是这个免费，用来讲解更合适，如果是Gitee仓库的代码就不适用了，但是核心原理是一样的。

Github Action入门
===============

当我们想往自己的项目里接入**Github Actions**时，要在根项目目录里新建`.github/workflows`目录。然后通过编写`yml`格式文件定义**Workflow(工作流程)去实现`CI`。在阅读`yml`文件之前，我们要先搞懂在Workflow**中一些比较重要的概念：

  

*   **Event(触发事件)**：指触发 **Workflow(工作流程)** 运行的事件。
*   **Job(作业)**：一个**工作流程**中包含一个或多个**Job**，这些**Job**默认情况下并行运行，但我们也可以通过设置让其按顺序执行。每个**Job**都在指定的环境(虚拟机或容器)里开启一个**Runner**(可以理解为一个进程)运行，包含多个**Step(步骤)**。
*   **Step(步骤)**：**Job**的组成部分，用于定义每一部的工作内容。每个**Step**在运行器环境中以其单独的进程运行，且可以访问工作区和文件系统。

以下图的`Workflow`作为例子，我们可以更直观地看懂**Event**、**Job**以及**Step**两者的关系：

![](/img/2024-08-25/1.png)

_在`Github Action`中， **Job** 和 **Step** 以及 **Workflow** 都有资源占用以及时间限制，超出限制就会直接取消运行，关于这些限制可看github action的文档说明。_

_我们用一个github官方的example来介绍下workflow：_

```yml
# 指定工作流程的名称
name: learn-github-actions
# 指定此工作流程的触发事件Event。 此示例使用 推送 事件，即执行push后，触发该流水线的执行
on: [push]
# 存放 learn-github-actions 工作流程中的所有Job
jobs:
  # 指定一个Job的名称为check-bats-version
  check-bats-version:
    # 指定该Job在最新版本的 Ubuntu Linux 的 Runner(运行器)上运行
    runs-on: ubuntu-latest
    # 存放 check-bats-version 作业中的所有Step
    steps:
      # step-no.1: 运行actions/checkout@v3操作，操作一般用uses来调用，
      # 一般用于处理一些复杂又频繁的操作例如拉取分支，安装插件
      # 此处 actions/checkout 操作是从仓库拉取代码到Runner里的操作
      - uses: actions/checkout@v3
      # step-no.2: actions/setup-node@v3 操作来安装指定版本的 Node.js，此处指定安装的版本为v14
      - uses: actions/setup-node@v3
        with:
          node-version: "14"
      # step-no.3: 运行命令行下载bats依赖到全局环境中
      - run: npm install -g bats
      # step-no.4: 运行命令行查看bats依赖的版本
      - run: bats -v
```

_整个`learn-github-actions`**工作流程**弄成流程图可如下所示：  
![](/img/2024-08-25/2.png)

为项目添加CI流程
=========

上文中介绍到CI的意思是持续集成，而普遍对其的解释是**频繁地（一天多次）将代码集成到主干**。对于这个解释我们要搞懂其中的两个概念：

1.  **主干**：是指包含多个已上和即将上线的特性的分支。
2.  **集成**：是指把含新特性的分支合并(`merge`)到**主干**上的行为  
    我们借`github flow`分支管理策略作为例子来更加深入了解`CI`及上面的两个概念。  
    
    `github flow`在开发新特性的运行模式如下所示：
    
    1.  基于`master`创建新的分支`feature`进行开发。注意这需要保证`master`的代码和特性永远是最稳定的。
    2.  开发期间，定期提交更改(`commit and push change`)到远程仓库的`feature`分支
    3.  在编码以及自测完成后，通过创建`pull request`去对`master`发起合并`feature`的请求
    4.  `pull request`在经过审核确认可行后合并到`master`分支
    5.  删除已合并的特性分支`feature`
    
    在`github Flow`模型中，**主干**指`master`分支，广义上是一个包含多个已上和即将上线的特性的分支；**集成**指的是在`pull request`通过后把特性分支`merge`合并到**主干**，也就是`master`分支上。而`github flow`模型**保证高质量的核心措施**是：在**集成**前通过`pull request`，从而触发审核。在审核通过后再合并到**主干**，从而保证**主干**的稳定性。  
    下面我们就按照`github flow`模型的机制，项目上添加`CI`流程。

在现有项目中添加CI
----------

根据上面所说的`github flow`模型**保证高质量的核心措施**可知，我们要定义的执行`CI`的**Workflow**（下称**CI Workflow**）的**Event**是`master`分支的`pull request`事件。而`Job`和`Step`的话没具体说明，而我们可以把目前最普遍的 **代码测试（Test）** 和 **代码扫描（Lint）** 加入其中。其实现思路是，首先要借助一些第三方插件，在`package.json`中的`scripts`定义可以执行**代码测试（Test）**和**代码扫描（Lint）**的命令，然后在把这些命令行加到**CI Workflow**的**Step**里。

### 代码扫描

前端的工具常用无非是三剑客：`eslint`+`prettier`+`stylelint`。使用方式如下所示：

umijs这个npm包，包含 prettier，eslint，stylelint 的配置文件合集，如果你不喜欢自己配置也可以。

**.eslintrc.js**

```js
// .eslintrc.js
module.exports = {
  extends: [require.resolve("@umijs/fabric/dist/eslint")],
};
```

**.prettierrc.js**

```js
// .prettierrc.js
const fabric = require("@umijs/fabric");
 
module.exports = {
  ...fabric.prettier,
};
```
**.stylelintrc.js**

```js
// .stylelintrc.js
const fabric = require("@umijs/fabric");
 
module.exports = {
  ...fabric.stylelint,
};
```

然后需要在`package.json`的`script`上加上对应的执行命令：

**package.json**

```json

"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "lint": "npm run lint:js && npm run lint:style && npm run lint:prettier",
  "lint:js": "eslint --cache --ext .js,.jsx,.ts,.tsx ./src",
  "lint:prettier": "prettier --check \"src/**/*\" --end-of-line auto",
  "lint:style": "stylelint --fix 'src/**/*.{css,scss,less}' --cache"
}
```

如果你创建项目的时候用到了官方脚手架，上述的命令应该大部分是配置好的，这里提一句如果你有更多的lint需求只需要在相应配置文件中配置好就好。

#### 自动化测试命令实现

前端测试主要有**单元测试（Unit Test）**、**集成测试（Integration Test）**、**UI 测试（UI Test）**。本文重点是实现`CI`而不是**前端自动化测试**，这里的单元测试就不详细介绍了，如果有需求自己编写单元测试文件。

#### 配置**CI Workflow**

**在项目根目录里的`.github/workflows`文件夹上新建`ci.yml`**

****ci.yml****

```yml
name: CI
# Event设置为main分支的pull request事件，
# 这里的main分支相当于master分支，github项目新建是把main设置为默认分支，我懒得改了所以就保持这样吧
on:
  pull_request:
    branches: main
jobs:
  # 只需要定义一个job并命名为CI
  CI:
    runs-on: ubuntu-latest
    steps:
      # 拉取项目代码
      - name: Checkout repository
        uses: actions/checkout@v2
      # 给当前环境下载node
      - name: Use Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "16.x"
      # 检查缓存
      # 如果key命中缓存则直接将缓存的文件还原到 path 目录，从而减少流水线运行时间
      # 若 key 没命中缓存时，在当前Job成功完成时将自动创建一个新缓存
      - name: Cache
        # 缓存命中结果会存储在steps.[id].outputs.cache-hit里，该变量在继后的step中可读
        id: cache-dependencies
        uses: actions/cache@v3
        with:
          # 缓存文件目录的路径
          path: |
            **/node_modules
          # key中定义缓存标志位的生成方式。runner.OS指当前环境的系统。外加对yarn.lock内容生成哈希码作为key值，如果yarn.lock改变则代表依赖有变化。
          # 这里用yarn.lock而不是package.json是因为package.json中还有version和description之类的描述项目但和依赖无关的属性
          key: ${{runner.OS}}-${{hashFiles('**/yarn.lock')}}
      # 安装依赖
      - name: Installing Dependencies
        # 如果缓存标志位没命中，则执行该step。否则就跳过该step
        if: steps.cache-dependencies.outputs.cache-hit != 'true'
        run: yarn install
      # 运行代码扫描
      - name: Running Lint
        # 通过前文定义的命令行执行代码扫描
        run: yarn lint
      # 运行自动化测试
      - name: Running Test
        # 通过前文定义的命令行执行自动化测试
        run: yarn test
```

**`关于上述workflow的缓存问题，详情可以去看github的官方文档，github action为了使工作流程更快、更高效，可以为依赖项及其他经常重复使用的文件创建和使用缓存。一般缓存是7天，总大小限制是10GB。`**

当创建`pull request`合并到主干时，CI Workflow触发运行，我们可以在github的action面板看到workflow的详细信息，这里我截图一个我github仓库之前的一个action记录

![](/img/2024-08-25/3.png)

**``如果失败这里也会能看到详细的log信息让你能得知原因，点开每个`step`查看控制台输出的信息``**

``确认代码安全可靠后就可以点击`Merge pull request`来把新代码集成到主干上。从而基于`CI`完成一次bug 修复或新特性迭代。```合并成功后，可以点击``` `Delete branch`以删除已合并的特性分支。``

**`为项目添加CD流程`**
===============

`CD`指的是 **持续交付（Continuous delivery）** 或者 **持续部署（continuous deployment）** 或者是两者的并集。

引用一下AWS对于CD流程的概括：

1.  1.  生成制品
    2.  自动部署到测试环境以校验其稳定性
    3.  部署到生产环境（自动的是**持续部署**，手动的是**持续交付**）

对于持续交付和持续部署，不同的devOps有不同的解释，明源云的mars我觉得应该是属于持续交付的，因为部署需要手动点击按钮触发而不是代码push到仓库后就开始自动部署。

github的action流程可以画一个流程图：

![](/img/2024-08-25/4.png)

  

在编写**CD Workflow**前，我们要准备以下东西：

1.  1.  内置`nginx`的服务器一台：用于部署制品
    2.  服务器的密钥对：用于提供给流水线通过 ssh 免密登录到服务器进行部署
    3.  `Github`里的**Personal Access Token**：用于提供给流水线免密登录`github`账号进行发布制品的操作
    4.  把步骤 2 和步骤 3 及其他关于机器的信息都放在对应仓库的**Secret**里

下面来简单讲解上面的一些步骤：

对于nginx，比较方便的方式就是docker镜像中去部署，明源云的Mars每次接测也是会根据docker的描述文件创建一个docker镜像，在镜像里面构建环境和部署相应打包后的程序，简单写个docker-compose.yml来创建和启动nginx:

**docker-compose.yml**

```yml
# 指定docker-compose解析的版本
version: "3"
services:
  pure-nginx:
    image: nginx:latest
    # 指定容器名
    container_name: pure-nginx
    restart: always
    # 指定持久卷，格式为 宿主机目录路径:容器目录路径
    # CD Workflow会通过密钥登录该服务器，然后把生成的制品放在/data/www里，在此之后直接访问宿主机的ip即可访问到项目页面
    volumes:
      - /data/www:/usr/share/nginx/html
    ports:
      - 80:80
```

**创建服务器的密钥对**：用于提供给流水线通过 ssh 免密登录到服务器进行部署

每个平台都有创建私钥的教程，我自己服务器用的是阿里云的，这里不便展示我的私钥，具体私钥配置去看云主机厂商的文档;

**创建Githubde P****ersonal Access Token:**用于给流水线提供免密登录github发布制品的操作

具体操作方式可以看github的官方文档[创建github私钥](https://docs.github.com/zh/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)

把前面创建的云主机的TOKEN和github token都放在当前仓库的secret变量中：

![](/img/2024-08-25/5.png)

**Secret**是一些相对机密重要的信息，这些信息在 **Workflow** 里面需要用到，但又不能以明文的形式直接写在文件里以免泄露。此时我们可以放在**Secret**里，在 **Workflow** 运行时这些**Secret**会以环境变量的形式注入到`Runner`里，此时可以以`${{ secrets.xxx }}`的形式读取。

在如图所示的页面下点击右上角的`New repository secret`去创建`secret`

配置**CD Workflow**
-----------------

这里我们把执行`CD`的**Workflow**的**Event**定义为`master`分支的`push`事件，因为**CD Workflow**的执行是在`Merge pull request`完成后的，而合并行为会触发**主干**的`push`事件。

接下来在`.github/workflows`里新建`cd.yml`来定义**CD Workflow**，代码如下所示：

**cd.yml**

```yml
name: CD
on:
  # 以主干的push事件作为触发条件
  push:
    branches: main
jobs:
  CD:
    runs-on: ubuntu-latest
    steps:
      # 拉取代码
      - name: Checkout repository
        uses: actions/checkout@v2
      # 下载Node
      - name: Use Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "16.x"
      # 添加缓存，逻辑和CI Workflow里的一样
      - name: Cache
        id: cache-dependencies
        uses: actions/cache@v3
        with:
          path: |
            **/node_modules
          key: ${{runner.OS}}-${{hashFiles('**/yarn.lock')}}
      # 安装依赖。命中缓存则跳过此步
      - name: Installing Dependencies
        if: steps.cache-dependencies.outputs.cache-hit != 'true'
        run: yarn install
      # 从package.json里获取version属性的值
      # 在CD Workflow中会给每个生成的制品打上标签，而标签取值于version值
      - name: Read Version
        # 读取出来的值会放在steps.[id].outputs.value供其他步骤step读取
        id: version
        uses: ashley-taylor/read-json-property-action@v1.0
        with:
          path: ./package.json
          property: version
      # 打包生成制品，且把制品压缩到assets.zip压缩包里
      - name: Building
        run: |
          yarn build
          zip -r assets ./dist/**
      # 基于当前commit进行版本发布(Create a release)，tag_name是v前缀加上package.json的version值
      - name: Create GitHub Release
        # 此步骤中，版本发布后会返回对应的url，以供下面上传制品的步骤中读取使用
        id: create_release
        uses: actions/create-release@v1
        env:
          # GITHUB_TOKEN是准备工作步骤三申请的Personal Access Token
          GITHUB_TOKEN: ${{ secrets.PROJECT_ACCESS_TOKEN }}
        with:
          tag_name: v${{steps.version.outputs.value}}
          release_name: v${{steps.version.outputs.value}}
          draft: false
          prerelease: false
      # 把assets.zip上传到仓库对应的发布版本Release上
      - name: Update Release Asset
        id: upload-release-asset
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.PROJECT_ACCESS_TOKEN }}
        with:
          upload_url: ${{ steps.create_release.outputs.upload_url }}
          asset_path: ./assets.zip
          asset_name: assets.zip
          asset_content_type: application/zip
      # 把制品上传到部署机器
      - name: Upload to Deploy Server
        uses: easingthemes/ssh-deploy@v2.0.7
        env:
          # SSH_PRIVATE_KEY为准备工作步骤三中生成密钥对里的私钥
          SSH_PRIVATE_KEY: ${{ secrets.DEPLOY_TOKEN }}
          # 指定当前目录中要上传的内容
          SOURCE: "dist/"
          # 指定上传到部署机器的哪个目录下
          TARGET: "/data/www"
          # 上传前指令，此处用于清空TARGET下的文件
          ARGS: "-avzr --delete"
          # REMOTE_HOST为机器的公网IP
          REMOTE_HOST: ${{ secrets.REMOTE_HOST }}
          # REMOTE_USER为登录机器时用到账号名
          REMOTE_USER: ${{secrets.REMOTE_USER}}
```

上述所有环境变量，例如${{secrets.REMOTE\_USER}}中的REMOTE\_USER都是之前步骤配置的token并且保存在仓库的secret变量中的，这里因为涉及到个人隐私就不展示了。

这样子就完成了**CD Workflow**的流程了，打开部署到的目标环境的url地址或者IP:PORT访问就能看到变化了。

后言
==

本文主要是讲之前使用github action做CI/CD的经验，标准公司的的CI/CD系统是更加完善的，但是万变不离其中，基础理论是一样的，gitlab仓库关联到CI/CD系统，CI/CD系统根据项目根目录的docker配置文件以及工作流配置文件，当开发者或者测试在CI/CD系统上点击操作从而完成CI/CD过程。