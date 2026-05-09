/**
 * AIcook 微信小程序构建脚本
 * 职责：将 miniprogram/ 下的 .ts 编译为 .js（同目录），其他文件（wxml/wxss/json/图片）保持不动。
 * 微信开发者工具会直接读取 miniprogram/ 作为小程序根。
 */
const gulp = require('gulp');
const ts = require('gulp-typescript');
const clean = require('gulp-clean');

const tsProject = ts.createProject('tsconfig.json');

const TS_GLOB = 'miniprogram/**/*.ts';
const JS_GLOB = 'miniprogram/**/*.js';

// 编译 TS -> JS（输出到同目录）
function compileTs() {
  return tsProject.src().pipe(tsProject()).js.pipe(gulp.dest('miniprogram'));
}

// 清理已编译的 JS（仅清理由 TS 生成的；如有手写 .js 需谨慎）
function cleanJs() {
  return gulp
    .src(JS_GLOB, { read: false, allowEmpty: true })
    .pipe(clean({ force: true }));
}

// 监听 TS 变化重新编译
function watchTs() {
  gulp.watch(TS_GLOB, compileTs);
}

exports.clean = cleanJs;
exports.build = compileTs;
exports.watch = gulp.series(compileTs, watchTs);
exports.default = compileTs;
