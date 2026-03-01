let notifviewURL = null;

// Function to change the notification status
const changeStatusFn = async (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Send a POST request to the notification view URL
      const response = await fetch(notifviewURL, {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      });
      resolve(response);
    } catch (error) {
      // If the request fails, resolve with a default response (notifResp)
      resolve(notifResp);
    }
  });
};

// Listen for push events
self.addEventListener("push", async (event) => {
  const notificationData = event.data.json(); // Parse the push event data
  notifviewURL = notificationData.data.notifviewURL; // Set the notification view URL

  // Wait until the status is changed and show the notification
  event.waitUntil(
    changeStatusFn(notificationData.data).then(() => {
      self.registration.showNotification(notificationData.title, notificationData);
    })
  );

  // Listen for notification click events
  self.addEventListener("notificationclick", (event) => {
    const url = notificationData.data.url; // Get the URL from the notification data

    // Close the notification
    event.notification.close();

    // Focus or open the URL in a new window
    event.waitUntil(
      clients.matchAll({ type: "window" }).then((clientList) => {
        // Check if the URL is already open in a window
        for (const client of clientList) {
          if (client.url === url && "focus" in client) {
            return client.focus(); // Focus the existing window
          }
        }

        // If the URL is not open, open it in a new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
    );
  });
});