# 中国数学课程知识图谱

mathmap-cn · by [Xiao Bin](https://www.zhihu.com/people/xmonkey)

270 个数学知识点的 3D 依赖脉络图，覆盖小学到高中（1-12 年级）完整数学课程。

**在线体验**：[mathmap-cn.vercel.app](https://mathmap-cn.vercel.app)
**源码**：[github.com/xmonkey/mathmap-cn](https://github.com/xmonkey/mathmap-cn)

![demo](viz/demo.mp4)

## 这是什么

把中国数学课标拆解成 270 个细粒度的"微主题"，用前置依赖关系连成一张有向无环图（DAG），以 3D 知识图谱的形式可视化呈现。点任意知识点，即可追溯它的一切前置基础。

## 功能

- **3D 知识图谱**：270 个节点按年级（高度）和领域（颜色/方位）分布，可拖拽旋转、滚轮缩放
- **前置链追溯**：点击任意知识点，高亮显示它的完整前置依赖链——"想学这个，必须先掌握什么"
- **领域筛选**：数与代数 / 图形与几何 / 统计与概率 / 综合与实践，可单独查看某一领域的知识脉络
- **年级筛选**：1-2 年级 / 3-4 年级 / 5-6 年级 / 7-9 年级 / 高中，按学段切片查看
- **详情面板**：每个知识点配有描述、掌握判据、评估提示、直接前置列表
- **课标对齐**：270 个微主题 100% 覆盖 123 条课标条目（义务教育 72 + 高中 51）

## 数据规模

| 维度 | 数量 |
|---|---:|
| 微主题 | 270 |
| 前置依赖边 | 327 |
| 课标条目 | 123 |
| 覆盖年级 | 1-12 |
| 领域 | 4 |

## 致谢

本项目参考了以下项目的设计与实现：

- [Marble Skill Taxonomy](https://github.com/withmarbleapp/os-taxonomy) — 数据模型与可视化灵感
- [os-taxonomy-japanese](https://github.com/jethac/os-taxonomy-japanese) — 工程实践参考

## 许可证

- 代码：[MIT](LICENSE)
- 数据内容：[CC BY-SA 4.0](LICENSE-CONTENT)
- 课程标准版权归教育部及相关出版方所有，本项目仅使用代码标识符（codes-only）
