import { MenuProps } from 'antd';
import Tool from '@static/tool.svg';
import {
  EditOutlined,
  FileTextOutlined,
  FileImageOutlined,
  VideoCameraAddOutlined,
  CodeOutlined,
  BulbOutlined,
  AudioOutlined,
} from '@ant-design/icons';

type MenuItem = Required<MenuProps>['items'][number];

export const items: MenuItem[] = [
  {
    key: 'All Tools',
    label: 'All Tools',
    icon: <Tool width="16px" height="16px" />,
  },
  {
    key: 'Text',
    label: 'Text',
    children: [
      { key: 'Chatbot', label: 'Chatbot' },
      { key: 'Text revision', label: 'Text revision' },
      { key: 'Text summarization', label: 'Text summarization' },
      { key: 'Text generation', label: 'Text generation' },
      { key: 'Translation', label: 'Translation' },
      { key: 'Others', label: 'Others' },
    ],
    icon: <EditOutlined />,
  },
  {
    key: 'Document',
    label: 'Document',
    icon: <FileTextOutlined />,
    children: [
      { key: 'Document helper', label: 'Document helper' },
      { key: 'PPT production', label: 'PPT production' },
      { key: 'Data processing', label: 'Data processing' },
      { key: 'Mind map generation', label: 'Mind map generation' },
      { key: 'Meeting assistant', label: 'Meeting assistant' },
      { key: 'Others', label: 'Others' },
    ],
  },
  {
    key: 'Image',
    label: 'Image',
    icon: <FileImageOutlined />,
    children: [
      { key: 'Image generation', label: 'Image generation' },
      { key: 'Image editing', label: 'Image editing' },
      { key: 'Image enhancement', label: 'Image enhancement' },
      { key: 'Face changing', label: 'Face changing' },
      { key: 'AI dressing', label: 'AI dressing' },
      { key: 'Watermark removal', label: 'Watermark removal' },
      { key: 'Others', label: 'Others' },
    ],
  },
  {
    key: 'Video',
    label: 'Video',
    icon: <VideoCameraAddOutlined />,
    children: [
      { key: 'Video generation', label: 'Video generation' },
      { key: 'Video editing', label: 'Video editing' },
      { key: 'Video enhancement', label: 'Video enhancement' },
      { key: 'Subtitle generation', label: 'Subtitle generation' },
      { key: 'Video summarization', label: 'Video summarization' },
      { key: 'Content moderation', label: 'Content moderation' },
      { key: 'Face changing', label: 'Face changing' },
      { key: 'Others', label: 'Others' },
    ],
  },
  {
    key: 'Audio',
    label: 'Audio',
    icon: <AudioOutlined />,
    children: [
      { key: 'Text to speech', label: 'Text to speech' },
      { key: 'Speech recognition', label: 'Speech recognition' },
      { key: 'Voice cloning', label: 'Voice cloning' },
      { key: 'Noise reduction', label: 'Noise reduction' },
      { key: 'Music composition', label: 'Music composition' },
      { key: 'Audio transcription', label: 'Audio transcription' },
      { key: 'Vocal separation', label: 'Vocal separation' },
      { key: 'Others', label: 'Others' },
    ],
  },
  {
    key: 'Code',
    label: 'Code',
    icon: <CodeOutlined />,
    children: [
      { key: 'Code assistant', label: 'Code assistant' },
      { key: 'Others', label: 'Others' },
    ],
  },
  {
    key: 'Others',
    label: 'Others',
    icon: <BulbOutlined />,
    children: [
      { key: 'Sensor data processing', label: 'Sensor data processing' },
      { key: '3D model generation', label: '3D model generation' },
      { key: 'Others', label: 'Others' },
    ],
  },
];
