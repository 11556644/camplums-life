// 手机号脱敏：13800000002 → 138****0002
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone;
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}

// 宿舍脱敏：隐藏房间号，只保留楼栋
export function maskDormitory(dormitory: string | null, roomNumber: string | null, showRoom: boolean): string {
  if (!dormitory) return "未填写";
  if (showRoom && roomNumber) return `${dormitory} ${roomNumber}`;
  return dormitory;
}

// 位置脱敏：只保留楼栋级别
export function maskLocation(location: string | null): string {
  if (!location) return "未填写";
  // 去除房间号等精确信息，只保留楼栋
  const buildingMatch = location.match(/^[一-龥a-zA-Z0-9]+(?:号楼|栋|楼|宿舍|公寓)/);
  if (buildingMatch) return buildingMatch[0];
  // 如果匹配不到楼栋模式，截取前4个字符
  return location.length > 6 ? location.slice(0, 6) + "..." : location;
}

// 判断两个用户之间是否有已完成的订单（用于决定是否展示完整信息）
export function isTransactionCompleted(viewerId: string, targetId: string, completedOrders: { buyerId: string; sellerId: string }[]): boolean {
  return completedOrders.some(
    (o) =>
      (o.buyerId === viewerId && o.sellerId === targetId) ||
      (o.sellerId === viewerId && o.buyerId === targetId)
  );
}

// 用户信息脱敏：根据查看者身份决定展示内容
export interface SanitizedUser {
  id: string;
  nickname: string;
  department: string | null;
  dormitory: string;
  phone?: string;
  roomNumber?: never; // 非自己不暴露房间号
}

export function sanitizeUserForViewer(
  user: { id: string; nickname: string; department: string | null; dormitory: string | null; roomNumber: string | null; phone?: string },
  viewerId: string | null,
  showFullInfo: boolean
): SanitizedUser {
  const isSelf = viewerId === user.id;

  return {
    id: user.id,
    nickname: user.nickname,
    department: user.department,
    dormitory: maskDormitory(user.dormitory, isSelf || showFullInfo ? user.roomNumber : null, isSelf || showFullInfo),
    ...(isSelf && user.phone ? { phone: user.phone } : {}),
  };
}
