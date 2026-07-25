import { canDeleteNotification } from "./Notifications";

describe("canDeleteNotification", () => {
  it("allows deletion for notifications owned by the signed-in user", () => {
    expect(canDeleteNotification({ user: { id: 7 } }, 7)).toBe(true);
  });

  it("allows deletion when the row does not expose an owner id", () => {
    expect(canDeleteNotification({}, 7)).toBe(true);
  });

  it("blocks deletion when the notification belongs to another user", () => {
    expect(canDeleteNotification({ user: { id: 9 } }, 7)).toBe(false);
  });
});
