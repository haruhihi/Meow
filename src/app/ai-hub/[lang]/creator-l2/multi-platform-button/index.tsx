import { Button, Checkbox, Popover } from 'antd';
import { IDict } from '../dictionaries';

export const MultiPlatformButton: React.FC<{
  onSubmit: () => void;
  platforms: string[];
  onPlatformChange: (value: string[]) => void;
  dict: IDict;
}> = (props) => {
  const { dict } = props;
  const options = dict.platforms;

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
            {dict.words['Done']}
          </Button>
        </div>
      }
      title={null}
      trigger="click"
    >
      <Button color="primary" variant="outlined" style={{ marginRight: 8, borderRadius: 12 }} size="small">
        {dict.words['Generate for other platforms']}
      </Button>
    </Popover>
  );
};
