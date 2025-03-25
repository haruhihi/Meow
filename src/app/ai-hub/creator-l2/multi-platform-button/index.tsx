import { Button, Checkbox, Popover } from 'antd';
import { useState } from 'react';

export const MultiPlatformButton: React.FC<{ onSubmit: (options: string[]) => void }> = (props) => {
  const options = [
    { label: '小红书', value: '小红书' },
    { label: '微博', value: '微博' },
    { label: 'Instagram', value: 'Instagram' },
    { label: 'X', value: 'X' },
    { label: 'Tiktok', value: 'Tiktok' },
    { label: 'Facebook', value: 'Facebook' },
  ];
  const [value, setValue] = useState(options.map((item) => item.value));
  return (
    <Popover
      content={
        <div>
          <Checkbox.Group options={options} value={value} onChange={(v) => setValue(v)} />
          <Button
            color="primary"
            variant="outlined"
            style={{ marginRight: 4 }}
            size="small"
            onClick={() => {
              props.onSubmit(value);
            }}
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
