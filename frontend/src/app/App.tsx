import { RouterProvider } from 'react-router'
import ConfigProvider from 'antd/es/config-provider'
import theme from 'antd/es/theme'
import zhCN from 'antd/locale/zh_CN'
import { XProvider } from '@ant-design/x'
import { Toaster } from 'sonner'
import { router } from './routes'
import { AIProvider } from './contexts/AIContext'
import { FeedbackProvider } from './contexts/FeedbackContext'

export default function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#ea580c',
          borderRadiusLG: 12,
        },
      }}
    >
      <XProvider>
        <FeedbackProvider>
          <AIProvider>
            <RouterProvider router={router} />
            <Toaster richColors closeButton position="top-center" />
          </AIProvider>
        </FeedbackProvider>
      </XProvider>
    </ConfigProvider>
  )
}
