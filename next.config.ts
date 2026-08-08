import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 禁止 Next 自动改写仓库根目录 AGENTS.md（本项目有独立产品约束文件）
  agentRules: false,
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
