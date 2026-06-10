# Attitude Resolution Visualizer (姿态解算 3D 可视化学习网)

> 🔗 **在线演示体验地址 (Live Demo)**: [https://shice666.github.io/attitude-visualizer/](https://shice666.github.io/attitude-visualizer/)

这是一个专门用于学习和直观理解空间姿态解算（Euler Angles 欧拉角、Quaternions 四元数、Rotation Matrix 旋转矩阵、万向锁 Gimbal Lock）的交互式 3D 可视化网页应用。

## 🌟 特色功能

1. **3D 交互操作**：支持直接通过鼠标在 3D 空间拖拽旋转物体（四元数增量累加计算，无奇异死锁），或旋转相机视角。
2. **机体坐标系（Body Frame）规范**：严格遵循航空航天标准机体轴（$X_b$ 前向红线、$Y_b$ 右向绿线、$Z_b$ 下向蓝线），匹配经典 RGB=XYZ 颜色映射。
3. **万向节环（Gimbal Rings）渲染**：三层嵌套的半透明物理发光环，可随欧拉角旋转顺序变化动态重构父子级，直观模拟万向锁发生时两轴重合失去自由度的本质。
4. **数学表示实时解算**：Roll、Pitch、Yaw、四元数分量（$w, x, y, z$）以及 $3\times3$ 旋转矩阵无延迟同步解算显示。
5. **万向锁（Gimbal Lock）演示**：一键强制 Pitch 至 90°，在 3D 中直观展示横滚与偏航环同轴重合的死锁现象。

## 🛠️ 本地运行

本项目采用纯静态前端架构，无需任何复杂的构建步骤。

- **直接运行**：直接双击 `index.html` 即可在现代浏览器中运行。
- **服务加载**：在项目目录下运行以下命令之一开启静态服务：
  ```bash
  # 使用 Python
  python -m http.server 8000
  
  # 使用 Node.js
  npx serve .
  ```
  然后访问 `http://localhost:8000` 或对应端口。

## 📚 涉及数学概念

- **欧拉角 (Euler Angles)**：Tait-Bryan 旋转，支持多种顺序组合（YXZ、XYZ、ZYX 等）。
- **四元数 (Quaternion)**：$q = w + x\mathbf{i} + y\mathbf{j} + z\mathbf{k}$，避免万向锁的最佳数学表示。
- **旋转矩阵 (Rotation Matrix)**：三维空间的正交投影变换矩阵。
