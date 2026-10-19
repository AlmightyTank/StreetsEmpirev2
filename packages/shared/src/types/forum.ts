export interface ForumLinkDto {
  username: string;
  profileUrl: string;
  linkedAt: string;
}

export interface ForumLinkStatusDto {
  enabled: boolean;
  link: ForumLinkDto | null;
}

export interface ForumCosmeticsDto {
  visible: boolean;
  supporter: {
    active: boolean;
    permanent: boolean;
    badgeKey: 'supporter-active';
    nameplateKey: 'supporter-forum-nameplate' | null;
    frameKey: 'supporter-forum-frame' | null;
  };
  avatarFrameKey: string | null;
}
