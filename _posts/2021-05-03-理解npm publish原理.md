---
layout:     post
title:      理解npm publish原理
subtitle:   理解npm publish原理
date:       2021-05-03
author:     SkioFox
header-img: img/post-bg-hacker.jpg
catalog: true
tags:
- npm
---

发布npm包也许是我们日常工作中的一部分，但是通过包管理工具发布一个npm其背后到底有什么故事，本文的主要目的是通过阅读yarn publish的源码来了解包管理工作是怎么来发布npm包，及我们碰到问题应该怎么去排查

## 背景

我们经常会发布`npm`包，那么有没有想过包管理工具`publish``npm`包后面的逻辑是怎么样的，今天以`yarn` 1.x的`publish`逻辑为例，通过了解 `publish` 背后的逻辑，帮助我们在发布`npm`包的过程中减少问题，及怎么快速定位并解决问题

通过本篇我们可以了解到如下内容

+ yarn publish 内部逻辑
+ yarn publish 维护版本号
+ yarn publish 发布不同的npm tag
+ _auth与_authToken区别

## publish原理

公司包管理工具，目前以`yarn`为主，所以以`yarn publish`为例，`yarn`版本为1.22.4

### publish步骤

从`yarn publish`源码看共分5步

+ 获取`package.json`内的`publishConfig.registry`
+ 设置`npm`包版本号
+ 获取令牌`token`
+ 将`npm`包发送到源服务器
+ `publish`结束

源码如下所示:

```js
export async function run(config: Config, reporter: Reporter, flags: Object, args: Array<string>): Promise<void> {

  const stat = await fs.lstat(dir);
  let publishPath = dir;
  if (stat.isDirectory()) {
    config.cwd = path.resolve(dir);
    publishPath = config.cwd;
  }

  let registry: string = '';

  if (pkg && pkg.publishConfig && pkg.publishConfig.registry) {
    registry = pkg.publishConfig.registry;
  }

  reporter.step(1, 4, reporter.lang('bumpingVersion'));
  const commitVersion = await setVersion(config, reporter, flags, [], false);

	// 获取token
  reporter.step(2, 4, reporter.lang('loggingIn'));
  const revoke = await getToken(config, reporter, pkg.name, flags, registry);

  reporter.step(3, 4, reporter.lang('publishing'));
  await publish(config, pkg, flags, publishPath);
  await commitVersion();
  reporter.success(reporter.lang('published'));

  reporter.step(4, 4, reporter.lang('revokingToken'));
  await revoke();
}
```

其中我们需要重点关注的是第一步设置版本号与第二步，获取源服务器`token`，因为只有获取到身份校验令牌，才能够与源服务器正常通信

### 设置版本号

`yarn publish`提供了不同的参数来帮助我们创建版本号，而不是我们自己手动维护版本号

默认跳过版本号设置

```plain
shell

 代码解读
复制代码# 如果我们不添加参数，默认是会跳过版本号设置
yarn publish
```

设置正式版本号

```plain
shell

 代码解读
复制代码# 设置补丁版本，比如之前的版本是1.0.0 执行之后会变成1.0.1
yarn publish --patch

# 设置小版本，比如之前的版本是1.1.0 执行之后会变成1.1.0
yarn publish --minor

# 设置大版本，比如之前的版本是1.0.1 执行之后会变成2.0.0
yarn publish --major
```

设置`beta` or `alpha`版本

```plain
shell

 代码解读
复制代码# 发布beta版本，比如1.0.0则会变成1.0.1-beta.0，比如1.1.1则会变成1.1.2-beta.0
yarn publish --prerelease --preid=beta

# 当我们beta版本稳定之后，可以通过上面的--patch发布正式版本
yarn publish --patch
```

注意点：如果准备发布`beta` or `alpha`之类的版本，那么`publish` 需要带上`--tag`参数，比如发布是`beta`版本`--tag=beta`，这样才会发布成真正的`beta`版本，不然会发布到`latest`tag上 ![](https://cdn.nlark.com/yuque/0/2024/webp/326579/1728899126545-766cb74e-2cda-4b8a-8160-80f94da1453e.webp) 如上图所示通过`yarn info [包名]`，查看`dist-tags`内是否有`beta` tag，如果有则表示发布成功

当然我们平常在发布`npm`包的时候，一帮不会直接使用`yarn publish`来维护我们的版本号

+ 单包我们一般会用到[standard-version](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fconventional-changelog%2Fstandard-version)
+ 多包，如果是`lerna`则会用到`lerna`本身的`version`命令来维护版本号

### 获取token

步骤如下

+ 判断是否传入`publishConfig.registry`参数，如果有则直接使用`getAuthByRegistry`获取`token`，如果没有传入`registry`则通过`getAuth`获取`token`
    - `getAuthByRegistry` 根据传入的`registry`获取`_authToken` or `_auth` or (username && _password base64之后生成的token)
    - `getAuth` 根据包名先获取`registry`，然后在通过`getAuthByRegistry`获取`token`
+ 如果通过`registry`无法获取`token`，在通过环境变量`YARN_AUTH_TOKEN`与`NPM_AUTH_TOKEN`获取token
+ 如果通过环境变量也无法到token，则判断是否设置了`--non-interactive`参数，true则直接抛出`No token found and can't prompt for login when running with --non-interactive.`
+ 如果没有设置`--non-interactive`，则继续获取username 与 email，如果username or email输入为false，则表示不需要校验token
+ 否则进一步获取password，然后通过password、username、email调用远程接口获取token
+ 如果上述过程都没有获取到token，则会抛`Incorrect username or password.`错误

源码如下所示

```js
export async function getToken(
  config: Config,
  reporter: Reporter,
  name: string = '',
  flags: Object = {},
  registry: string = '',
): Promise<() => Promise<void>> {
  // 根据传入的registry获取_authToken or _auth
  const auth = registry ? config.registries.npm.getAuthByRegistry(registry) : config.registries.npm.getAuth(name);

  if (config.otp) {
    config.registries.npm.setOtp(config.otp);
  }

	// 如果已经获取到token则可以直接返回
  if (auth) {
    config.registries.npm.setToken(auth);
    return function revoke(): Promise<void> {
      reporter.info(reporter.lang('notRevokingConfigToken'));
      return Promise.resolve();
    };
  }

  // 如果上一步无法获取到token，则通过环境变量获取token
  const env = process.env.YARN_AUTH_TOKEN || process.env.NPM_AUTH_TOKEN;

  // 如果环境变量中有token，则直接返回
  if (env) {
    config.registries.npm.setToken(`Bearer ${env}`);
    return function revoke(): Promise<void> {
      reporter.info(reporter.lang('notRevokingEnvToken'));
      return Promise.resolve();
    };
  }

  // 如果前面的步骤都没获取到token，通过判断参数--non-interactive是否存在，决定抛出错误
  if (flags.nonInteractive || config.nonInteractive) {
    throw new MessageError(reporter.lang('nonInteractiveNoToken'));
  }

  const creds = await getCredentials(config, reporter);
  if (!creds) {
    reporter.warn(reporter.lang('loginAsPublic'));
    return function revoke(): Promise<void> {
      reporter.info(reporter.lang('noTokenToRevoke'));
      return Promise.resolve();
    };
  }

  const {username, email} = creds;
  const password = await reporter.question(reporter.lang('npmPassword'), {
    password: true,
    required: true,
  });

  const userobj = {
    _id: `org.couchdb.user:${username}`,
    name: username,
    password,
    email,
    type: 'user',
    roles: [],
    date: new Date().toISOString(),
  };

  // 通过用户名、密码等从远程接口获取token
  const res = await config.registries.npm.request(`-/user/org.couchdb.user:${encodeURIComponent(username)}`, {
    method: 'PUT',
    registry,
    body: userobj,
    auth: {username, password, email},
  });

  if (res && res.ok) {
    reporter.success(reporter.lang('loggedIn'));

    const token = res.token;
    config.registries.npm.setToken(`Bearer ${token}`);

    return async function revoke(): Promise<void> {
      reporter.success(reporter.lang('revokedToken'));
      await config.registries.npm.request(`-/user/token/${token}`, {
        method: 'DELETE',
        registry,
      });
    };
  } else {
    throw new MessageError(reporter.lang('incorrectCredentials'));
  }
}
```

```js
getAuthByRegistry(registry) {
  // 判断配置中是否有_authToken属性，比如'//registry-npm.xxx.cn/repository/xxx/:_authToken': 'NpmToken.35aa0c7e-ad7a-3e57-b353-84873hsj',
  const authToken = this.getRegistryOrGlobalOption(registry, '_authToken');
  if (authToken) {
    return `Bearer ${String(authToken)}`;
  }

  // 判断配置中是否有_auth属性，比如_auth: xxxxxx
  const auth = this.getRegistryOrGlobalOption(registry, '_auth');
  if (auth) {
    return `Basic ${String(auth)}`;
  }

  // 通过用户名与密码直接生成_auth属性的值
  const username = this.getRegistryOrGlobalOption(registry, 'username');
  const password = this.getRegistryOrGlobalOption(registry, '_password');
  if (username && password) {
    const pw = Buffer.from(String(password), 'base64').toString();
    return 'Basic ' + Buffer.from(String(username) + ':' + pw).toString('base64');
  }

  return '';
}


getAuth(packageIdent) {
  if (this.token) {
    return this.token;
  }

  const baseRegistry = this.getRegistry(packageIdent);
  const registries = [baseRegistry];

  // If sending a request to the Yarn registry, we must also send it the auth token for the npm registry
  if (baseRegistry === (_constants || _load_constants()).YARN_REGISTRY) {
    registries.push(DEFAULT_REGISTRY);
  }

  for (const registry of registries) {
    const auth = this.getAuthByRegistry(registry);

    if (auth) {
      return auth;
    }
  }

  return '';
}

getRegistryOption(registry, option) {
  const pre = REGEX_REGISTRY_HTTP_PROTOCOL;
  const suf = REGEX_REGISTRY_SUFFIX;

  // When registry is used config scope, the trailing '/' is required
  const reg = (0, (_misc || _load_misc()).addSuffix)(registry, '/');

  // 1st attempt, try to get option for the given registry URL
  // 2nd attempt, remove the 'https?:' prefix of the registry URL
  // 3nd attempt, remove the 'registry/?' suffix of the registry URL
  return this.getScopedOption(reg, option) || pre.test(reg) && this.getRegistryOption(reg.replace(pre, ''), option) || suf.test(reg) && this.getRegistryOption(reg.replace(suf, ''), option);
}

getRegistryOrGlobalOption(registry, option) {
  return this.getRegistryOption(registry, option) || this.getOption(option);
}
```

从源码我们可以知道，当我们碰到`publish`问题的时候，可以按以下步骤进行排查

+ 第一步：检查源是否已设置，有三个地方可以可以设置源 
    - `package.json`的`publishConfig.registry`
    - 配置文件`.npmrc` or `.yarnrc`内的，可以通过`yarn config list` 查看
    - `yarn publish --registry xxxx` 命令行参数上带的`--registry`
+ 第二步：检查`token`，检查项目目录 OR 用户根目录下的`.npmrc`or `.yarnrc`文件内是否有`_authToken` or `_auth`，可以通过`yarn config list`查看
+ 第三步：如果是`_auth`则跳过此步，如果是`_authToken`，要检查要发布的源是否与`_authToken`上的源一致
+ 第四步：检查是否有`YARN_AUTH_TOKEN` or `NPM_AUTH_TOKEN`环境变量

### 生成token

`npm`令牌`token`，有两种，一种是早期的明文`token`，通过`_auth`参数获取，一种是后面的加密`token`，通过`_authToken`参数获取

#### 生成_auth值

+ 使用openssl base64直接生成令牌 echo -n 'admin:admin123' | openssl base64
+ 使用nodejs方式生成令牌

```js
const pw = Buffer.from(String(password), 'base64').toString();
const token = Buffer.from(String(username) + ':' + pw).toString('base64');
```

然后将上面生成的token通过_auth参数进行设置，可以直接配置到.npmrc内，也可以通过npm config set命令来设置

```sh
email=you@example.com
always-auth=true
_auth=YWRtaW46YWRtaW4xMjM=
```

```sh
config set _auth YWRtaW46YWRtaW4xMjM=
```

设置好_auth参数之后，就可以直接publish npm包了

#### 生成_authToken值

使用npm login --registry=源地址，不推荐使用yarn login 执行npm login 然后会让输入用户名与密码，如果账号密码验证正确，会在根目录的.npmrc内生成一个_authToken，如下所示

如果是scope包，则需要带上--scope=@namespace

```sh
npm login --scope=@namespace --registry=源地址
```

格式为 '//源地址:_authToken': 'value'

```sh
'//registry-npm.mus.cn/repository/ak/:_authToken': 'NpmToken.35aa0c7e-kdjs-444-b353-be1dd8e66571'
```

大概我们publish npm包的时候，会先找registry，然后通过registry找_authToken，如果匹配成功，则可以正常publish npm包

#### _auth与_authToken的区别

其实从生成过程来看，就能看出，_auth是一种明文生成的令牌方式，容易导致用户名与密码泄露，而_authToken是通过源服务器生成的一种令牌方式，相对于明文方式更安全

_auth是npm早期的一个产物，根据npm自身的规划，_auth这种方式，最终是会被去掉的，更多内容可以参考[Deprecate and drop _password and _auth support in .npmrc](https://link.juejin.cn?target=https%3A%2F%2Fgithub.com%2Fnpm%2Fnpm%2Fissues%2F9866)

## 总结

从源码看yarn publish逻辑并不复杂，关键逻辑就在获取token的步骤，只要能够正确获取到token，那么publish基本上不会被阻塞，不过有一点不方便的就是，通过全局安装的yarn是一个bundle.js的形式，不好劫持内部的代码，打印日志，所以更多的还是需要自身按照排查步骤，一步一步排查
