import fs from 'fs';
import path from 'path';

// 定义输出目录
const OUTPUT_DIR = path.join('D:/', 'My Note', '.obsidian', 'plugins', 'ink');
const mainJsPath = path.join(OUTPUT_DIR, 'main.js');

// 检查文件是否存在
if (!fs.existsSync(mainJsPath)) {
    console.error('Error: main.js file not found at', mainJsPath);
    process.exit(1);
}

// 读取文件内容
let content = fs.readFileSync(mainJsPath, 'utf8');

// 使用更安全的方法转换为单行，避免破坏正则表达式
// 首先识别并保护所有字符串和正则表达式
const protectedParts = [];

// 保护正则表达式
content = content.replace(/\/((?![*\/]).+?)(?<!\\)\/[gimuy]*/g, (match) => {
    const id = `__PROTECTED_${protectedParts.length}__`;
    protectedParts.push(match);
    return id;
});

// 保护单引号字符串
content = content.replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, (match) => {
    const id = `__PROTECTED_${protectedParts.length}__`;
    protectedParts.push(match);
    return id;
});

// 保护双引号字符串
content = content.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
    const id = `__PROTECTED_${protectedParts.length}__`;
    protectedParts.push(match);
    return id;
});

// 保护模板字符串
content = content.replace(/`([^`]*)`/g, (match) => {
    const id = `__PROTECTED_${protectedParts.length}__`;
    protectedParts.push(match);
    return id;
});

// 现在安全地移除换行符和多余空格
content = content
    .replace(/\/\/.*$/gm, '') // 移除单行注释
    .replace(/\/\*[\s\S]*?\*\//g, '') // 移除多行注释
    .replace(/\n\s*/g, '') // 移除换行符和行首空格
    .replace(/\s{2,}/g, ' ') // 将多个连续空格替换为单个空格
    .replace(/([;{}])\s+/g, '$1') // 移除分号、大括号后的空格
    .replace(/\s+([;{}])/g, '$1') // 移除分号、大括号前的空格
    .trim();

// 恢复所有被保护的部分
protectedParts.forEach((part, i) => {
    content = content.replace(`__PROTECTED_${i}__`, part);
});

// 写回文件
fs.writeFileSync(mainJsPath, content);
console.log('Successfully converted main.js to single line format');