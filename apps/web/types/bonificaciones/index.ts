export const TIP_AMOUNTS = [5, 10, 20] as const;
export type TipAmount = (typeof TIP_AMOUNTS)[number];

export interface Tip {
  id: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  amount: TipAmount;
  description: string;
  createdAt: string | null;
}

export interface AdminWallet {
  balanceMxn: number;
  lastUpdatedAt: string | null;
}

export interface UserBalance {
  userId: string;
  userName: string;
  userEmail: string;
  balanceMxn: number;
  lastUpdatedAt: string | null;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export type SendTipInput = {
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  amount: TipAmount;
  description: string;
};

export interface WalletLoadEvent {
  type: "walletLoad";
  id: string;
  adminId: string;
  adminName: string;
  adminEmail: string;
  amount: number;
  newBalance: number;
  createdAt: string | null;
}

export type ActivityItem = ({ type: "tip" } & Tip) | WalletLoadEvent;
