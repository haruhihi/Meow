import { Button, Checkbox, Form, Popover } from 'antd';

export const MultiPlatformButton: React.FC = () => {
  const options = [
    { label: '小红书', value: '小红书' },
    { label: '微博', value: '微博' },
    { label: 'Instagram', value: 'Instagram' },
    { label: 'X', value: 'X' },
    { label: 'Tiktok', value: 'Tiktok' },
    { label: 'Facebook', value: 'Facebook' },
  ];
  return (
    <Popover
      content={
        <div>
          <Checkbox.Group options={options} />
          <Button color="primary" variant="outlined" style={{ marginRight: 4 }} size="small">
            生成
          </Button>
        </div>
      }
      title={null}
      trigger="click"
    >
      <Button color="primary" variant="outlined" style={{ marginRight: 4 }} size="small">
        一键生成多平台文案
      </Button>
    </Popover>
  );
};
