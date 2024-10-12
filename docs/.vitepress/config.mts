import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "SkioFox Home",
  description: "分享技术、生活: SkioFox, Blog, 博客, LoverFancy, web, 前端开发, JS, VUE, React, Node, Go, 全栈",
  srcDir: "./src",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: '/img/BY_bolg_logo.png',
    // nav: [
    //   { text: 'Home', link: '/' },
    //   { text: 'blog', link: '/introduction' }
    // ],
    // 顶部导航栏
    nav: [
      { text: "👋 About", link: "/about.md" },
      { text: "💭 前端", link: "/frontend/index.md" },
      { text: "🦄 后端", link:  "/backend/index.md" },
      { text: "👫 综合", link:  "/others/index.md" },
    ],
    // sidebar: [
    //   {
    //     text: '文章列表',
    //     items: [
    //       { text: '个人介绍', link: '/hello.md' },
    //       { text: '个人介绍2', link: '/hello.md' },
    //     ]
    //   },
    //   {
    //     text: '文章列表2',
    //     items: [
    //       { text: '个人介绍', link: '/hello.md' },
    //     ]
    //   }
    // ],
    // 文章内导航栏标题
    outlineTitle: "导航栏",
    // 是否启动搜索功能
    search: {
      provider: "local",
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/LoverFancy' }
    ],
    footer: {
      copyright: "Copyright © 2024 By SkioFox",
    },
  }
})
