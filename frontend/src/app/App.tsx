import { RouterProvider } from "react-router";
import { ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { XProvider } from "@ant-design/x";
import { router } from "./routes";
import { AIProvider } from "./contexts/AIContext";

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: "#ea580c",
          borderRadiusLG: 12,
        },
      }}
    >
      <XProvider>
        <AIProvider>
          <RouterProvider router={router} />
        </AIProvider>
      </XProvider>
    </ConfigProvider>
  );
}
