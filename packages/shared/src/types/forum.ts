export interface ForumLinkDto {
  username: string;
  profileUrl: string;
  linkedAt: string;
}

export interface ForumLinkStatusDto {
  enabled: boolean;
  link: ForumLinkDto | null;
}
