/**
 * 行政区划下拉用的轻量数据。
 *
 * 只收录**省级**全量 + **浙江省**的市/县全量：这是本应用实际用得到的范围。
 * 完整的全国省市县三级约 300KB，为几个地址字段不值得；
 * 其他省份的市/县走自由输入（输入框带 datalist 建议，仍可手打生僻地名）。
 *
 * 若以后要补别的省，在 COUNTY_SUGGESTIONS 里加一个 key 即可，结构一致。
 */

export const PROVINCES = [
  "北京市",
  "天津市",
  "河北省",
  "山西省",
  "内蒙古自治区",
  "辽宁省",
  "吉林省",
  "黑龙江省",
  "上海市",
  "江苏省",
  "浙江省",
  "安徽省",
  "福建省",
  "江西省",
  "山东省",
  "河南省",
  "湖北省",
  "湖南省",
  "广东省",
  "广西壮族自治区",
  "海南省",
  "重庆市",
  "四川省",
  "贵州省",
  "云南省",
  "西藏自治区",
  "陕西省",
  "甘肃省",
  "青海省",
  "宁夏回族自治区",
  "新疆维吾尔自治区",
  "香港特别行政区",
  "澳门特别行政区",
  "台湾省",
] as const;

/** 浙江省全部县级行政区（含 三门县）。按地级市分组归档后拍平，便于 datalist 建议。 */
const ZHEJIANG_COUNTIES = [
  // 杭州市
  "上城区", "拱墅区", "西湖区", "滨江区", "萧山区", "余杭区", "临平区",
  "钱塘区", "富阳区", "临安区", "桐庐县", "淳安县", "建德市",
  // 宁波市
  "海曙区", "江北区", "北仑区", "镇海区", "鄞州区", "奉化区",
  "象山县", "宁海县", "余姚市", "慈溪市",
  // 温州市
  "鹿城区", "龙湾区", "瓯海区", "洞头区", "永嘉县", "平阳县",
  "苍南县", "文成县", "泰顺县", "瑞安市", "乐清市", "龙港市",
  // 嘉兴市
  "南湖区", "秀洲区", "嘉善县", "海盐县", "海宁市", "平湖市", "桐乡市",
  // 湖州市
  "吴兴区", "南浔区", "德清县", "长兴县", "安吉县",
  // 绍兴市
  "越城区", "柯桥区", "上虞区", "新昌县", "诸暨市", "嵊州市",
  // 金华市
  "婺城区", "金东区", "武义县", "浦江县", "磐安县",
  "兰溪市", "义乌市", "东阳市", "永康市",
  // 衢州市
  "柯城区", "衢江区", "常山县", "开化县", "龙游县", "江山市",
  // 舟山市
  "定海区", "普陀区", "岱山县", "嵊泗县",
  // 台州市
  "椒江区", "黄岩区", "路桥区", "三门县", "天台县",
  "仙居县", "温岭市", "临海市", "玉环市",
  // 丽水市
  "莲都区", "青田县", "缙云县", "遂昌县", "松阳县",
  "云和县", "庆元县", "景宁畲族自治县", "龙泉市",
];

export const COUNTY_SUGGESTIONS: Record<string, readonly string[]> = {
  浙江省: ZHEJIANG_COUNTIES,
};

/** 该省是否有市/县建议；没有就退化为纯自由输入 */
export function countySuggestionsOf(province: string): readonly string[] {
  return COUNTY_SUGGESTIONS[province] ?? [];
}

/**
 * 把「浙江省三门县」拆成省 + 市/县。
 *
 * 不新增 schema 字段：地址仍只存一条字符串，
 * 拆只发生在这里，避免为了两个下拉把数据模型撑成四个字段。
 */
export function splitAddress(value: string | undefined): {
  province: string;
  county: string;
} {
  const text = (value ?? "").trim();
  if (!text) return { province: "", county: "" };
  const province = PROVINCES.find((p) => text.startsWith(p));
  if (!province) return { province: "", county: text };
  return { province, county: text.slice(province.length) };
}

/** 省 + 市/县 合成一条地址；两边都空则返回空串 */
export function joinAddress(province: string, county: string): string {
  return `${province}${county}`.trim();
}
