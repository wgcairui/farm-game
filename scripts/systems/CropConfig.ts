/**
 * 作物配置表（MVP 5 种）。
 * 实际项目应放在 assets/config/crops.json 通过 Resources 加载。
 */

export interface CropConfig {
    id: string;
    name: string;
    icon: string;
    seedPrice: number;
    sellPrice: number;
    growthDuration: number;   // 秒
    stages: number;           // 含种子 + 枯萎前的所有阶段
    seedItemId: string;       // 背包里的种子 id
    cropItemId: string;       // 收获后入仓库的作物 id
}

export const CROPS: Record<string, CropConfig> = {
    carrot: {
        id: 'carrot',
        name: '白萝卜',
        icon: 'carrot_icon',
        seedPrice: 10,
        sellPrice: 25,
        growthDuration: 30,
        stages: 4,
        seedItemId: 'carrot_seed',
        cropItemId: 'carrot',
    },
    potato: {
        id: 'potato',
        name: '土豆',
        icon: 'potato_icon',
        seedPrice: 30,
        sellPrice: 70,
        growthDuration: 120,
        stages: 4,
        seedItemId: 'potato_seed',
        cropItemId: 'potato',
    },
    corn: {
        id: 'corn',
        name: '玉米',
        icon: 'corn_icon',
        seedPrice: 60,
        sellPrice: 150,
        growthDuration: 300,
        stages: 4,
        seedItemId: 'corn_seed',
        cropItemId: 'corn',
    },
    tomato: {
        id: 'tomato',
        name: '番茄',
        icon: 'tomato_icon',
        seedPrice: 100,
        sellPrice: 280,
        growthDuration: 900,
        stages: 4,
        seedItemId: 'tomato_seed',
        cropItemId: 'tomato',
    },
    strawberry: {
        id: 'strawberry',
        name: '草莓',
        icon: 'strawberry_icon',
        seedPrice: 200,
        sellPrice: 600,
        growthDuration: 3600,
        stages: 4,
        seedItemId: 'strawberry_seed',
        cropItemId: 'strawberry',
    },
};

export function getCrop(id: string): CropConfig | undefined {
    return CROPS[id];
}