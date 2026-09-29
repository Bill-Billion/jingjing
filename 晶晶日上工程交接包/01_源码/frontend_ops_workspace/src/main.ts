/*
 * 样式加载顺序不能反。
 *
 * Element Plus 自己的样式表里也在 :root 上声明了一套 --el-* 变量
 * （--el-color-primary: #409eff 等）。同一个选择器优先级相同时，后写的赢。
 * 所以顺序必须是「先 Element Plus，后 tokens.css」——反过来我们的品牌色
 * 会被它抢回去，按钮、标签、链接全变成默认蓝。
 * （这个顺序写反过一次，产物 CSS 里 #1b2740 在前、#409eff 在后，
 *   登录页看不出来，工作台和 404 页的按钮是蓝的。）
 */
import 'element-plus/dist/index.css'
import '@/styles/tokens.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

import App from './App.vue'
import router from './router'

const app = createApp(App)

// 顺序有讲究：Pinia 必须先装上，路由守卫里会用到 store
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

app.mount('#app')
