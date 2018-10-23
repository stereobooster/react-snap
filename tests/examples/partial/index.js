if (navigator.userAgent === "ReactSnap") {
    // Strip out all content except the root
    while (document.firstChild)
        document.removeChild(document.firstChild);

    let div = document.createElement("div");
    div.className = `root`;
    div.innerHTML = `This is my content`;

    document.appendChild(div);
}