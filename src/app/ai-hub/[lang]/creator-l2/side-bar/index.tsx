import React, { useState } from 'react';
import { getTypeConfigs } from '../type-config';
import { Menu, MenuProps } from 'antd';
import Tool from '@static/tool.svg';
import { IDict } from '../dictionaries';

interface LevelKeysProps {
  key?: string;
  children?: LevelKeysProps[];
}

export const SideBar: React.FC<{
  onClickItem: (v: string[]) => void;
  typeConfigs: ReturnType<typeof getTypeConfigs>;
  dict: IDict;
}> = (props) => {
  const { onClickItem, typeConfigs, dict } = props;
  const [stateOpenKeys, setStateOpenKeys] = useState<string[]>(['Bing AI Writing']);

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

  const levelKeys = getLevelKeys(typeConfigs as LevelKeysProps[]);

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
      defaultSelectedKeys={['Bing AI Writing']}
      openKeys={stateOpenKeys}
      onOpenChange={onOpenChange}
      style={{ width: 256 }}
      items={[
        {
          key: 'Bing AI Writing',
          label: dict.words['Bing AI Writing'],
          icon: <Tool width="16px" height="16px" />,
          children: typeConfigs,
        },
      ]}
      onClick={(item) => {
        onClickItem(item.keyPath);
      }}
    />
  );
};
