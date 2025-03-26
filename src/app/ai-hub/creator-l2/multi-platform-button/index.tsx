import { Button, Checkbox, Popover } from 'antd';

export const MultiPlatformButton: React.FC<{
  onSubmit: () => void;
  platforms: string[];
  onPlatformChange: (value: string[]) => void;
}> = (props) => {
  const options = [
    { label: '微博', value: '微博' },
    { label: '小红书', value: '小红书' },
    { label: '微信公众号', value: '微信公众号' },
    { label: '微信朋友圈', value: '微信朋友圈' },
    { label: 'X', value: 'X' },
    { label: 'Tiktok', value: 'Tiktok' },
    { label: 'Facebook', value: 'Facebook' },
  ];

  return (
    <Popover
      content={
        <div>
          <Checkbox.Group options={options} value={props.platforms} onChange={(v) => props.onPlatformChange(v)} />
          <Button
            color="primary"
            variant="outlined"
            style={{ marginRight: 4 }}
            size="small"
            onClick={() => props.onSubmit()}
          >
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
