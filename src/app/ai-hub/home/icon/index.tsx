import React from 'react';
import {
  EditOutlined,
  FileTextOutlined,
  FileImageOutlined,
  VideoCameraAddOutlined,
  CodeOutlined,
  BulbOutlined,
} from '@ant-design/icons';
// Text, Document, Image, Video, Audio, Code, Others
const iconMap = {
  Text: <EditOutlined />,
  Document: <FileTextOutlined />,
  Image: <FileImageOutlined />,
  Video: <VideoCameraAddOutlined />,
  Code: <CodeOutlined />,
  Others: <BulbOutlined />,
};
export const Icon: React.FC<{
  source: string | React.ReactNode;
  size?: string;
  className?: string;
  category1?: string;
}> = (props) => {
  const { source, className, category1 } = props;
  const defaultIcon = (iconMap as any)[category1 ?? ''] ?? <BulbOutlined />;

  const isEnableDefaultSvg = global?.location?.href?.indexOf('endfticon') > -1;

  const result =
    typeof source === 'string' ? (
      <div
        className={className}
        dangerouslySetInnerHTML={{
          __html: source
            .replace(/(<svg\b[^>]*?)\s?width="\d+"\s?/i, '$1')
            .replace(/(<svg\b[^>]*?)\s?height="\d+"/i, '$1'),
        }}
      />
    ) : isEnableDefaultSvg && !source ? (
      defaultIcon
    ) : (
      <div className={className}>{source}</div>
    );
  return result;
};
