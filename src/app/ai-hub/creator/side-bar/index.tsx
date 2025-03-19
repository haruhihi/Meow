// import Tool from '@static/tool.svg';
import React, { useState } from 'react';
// import styles from './index.module.scss';
// import { UpOutlined } from '@ant-design/icons';
// import { Icon } from '../icon';
// import { AI_Tool } from '@prisma/client';
import { items } from './config';
import { Menu, MenuProps } from 'antd';
import Tool from '@static/tool.svg';

interface LevelKeysProps {
  key?: string;
  children?: LevelKeysProps[];
}

export const SideBar: React.FC<{
  onClickItem: (v: string[]) => void;
}> = (props) => {
  const { onClickItem } = props;
  const [stateOpenKeys, setStateOpenKeys] = useState<string[]>(['Creator']);

  const getLevelKeys = (items1: LevelKeysProps[]) => {
    const key: Record<string, number> = {};
    const func = (items2: LevelKeysProps[], level = 1) => {
      items2.forEach((item) => {
        if (item.key) {
          key[item.key] = level;
        }
        if (item.children) {
          func(item.children, level + 1);
        }
      });
    };
    func(items1);
    return key;
  };

  const levelKeys = getLevelKeys(items as LevelKeysProps[]);

  const onOpenChange: MenuProps['onOpenChange'] = (openKeys) => {
    const currentOpenKey = openKeys.find((key) => stateOpenKeys.indexOf(key) === -1);
    // open
    if (currentOpenKey !== undefined) {
      const repeatIndex = openKeys
        .filter((key) => key !== currentOpenKey)
        .findIndex((key) => levelKeys[key] === levelKeys[currentOpenKey]);

      setStateOpenKeys(
        openKeys
          // remove repeat key
          .filter((_, index) => index !== repeatIndex)
          // remove current level all child
          .filter((key) => levelKeys[key] <= levelKeys[currentOpenKey])
      );
    } else {
      // close
      setStateOpenKeys(openKeys);
    }
  };
  return (
    <Menu
      mode="inline"
      defaultSelectedKeys={['Creator']}
      openKeys={stateOpenKeys}
      onOpenChange={onOpenChange}
      style={{ width: 256 }}
      items={[
        {
          key: 'Creator',
          label: 'Creator',
          icon: <Tool width="16px" height="16px" />,
        },
        ...items,
      ]}
      onClick={(item) => {
        onClickItem(item.keyPath);
      }}
    />
  );
};
