// Category rows navigate to practice page
document.querySelectorAll(".category-row").forEach(row => {
  row.addEventListener("click", () => {
    const category = row.dataset.category;
    if (!category) return console.error("Category is missing");
    window.location.href = `practice.html?category=${category}`;
  });
});

// Sidebar "Practice" button → home
const practiceNav = document.getElementById("practiceNav");
if (practiceNav) practiceNav.addEventListener("click", () => window.location.href = "index.html");
