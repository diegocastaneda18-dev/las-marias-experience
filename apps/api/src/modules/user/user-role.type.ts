export const Role = {
  admin: "admin",
  committee: "committee",
  captain: "captain",
  team_member: "team_member",
  public_view: "public_view",
} as const;

export type Role = (typeof Role)[keyof typeof Role];
