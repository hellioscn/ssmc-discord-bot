/**
 * members.js — Silence Souls MC Üyeler Sayfası
 * İnteraktif Üye Paneli (Soyağacı / Arşiv Mantığı)
 */

function initMembersPage() {
  const API_URL = "https://ssmc-discord-bot.onrender.com/api/members";

  async function fetchMembers() {
    const memberChain = document.getElementById("member-chain");
    
    // Fallback Fonksiyonu (Hata veya Gecikme durumunda)
    const useFallback = () => {
        console.warn("API Gecikti/Hatalı. Yedek veriler yükleniyor...");
        if (typeof SITE_CONFIG !== "undefined" && SITE_CONFIG.Kultur?.Kurucular?.uyeler) {
            renderMembers(SITE_CONFIG.Kultur.Kurucular.uyeler);
        } else {
            if (memberChain) memberChain.innerHTML = "<p style='color: white; padding: 20px;'>Veri akışı sağlanamadı.</p>";
        }
    };

    // 10 Saniyelik Timeout (Bot uyanmazsa fallback'e geç)
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Timeout")), 10000)
    );

    try {
      if (memberChain) {
        memberChain.innerHTML = `
          <div class="archive-loading">
            <span class="loading-dot"></span>
            <p>ARŞİV BAĞLANTISI KURULUYOR...</p>
          </div>
        `;
      }

      // API ve Timeout yarışı
      const response = await Promise.race([fetch(API_URL), timeoutPromise]);
      const data = await response.json();
      const UYELER = data.members || data;

      if (!UYELER || UYELER.length === 0) {
        useFallback();
        return;
      }

      renderMembers(UYELER);
    } catch (err) {
      console.error("Discord/Fetch Hatası:", err.message);
      useFallback();
    }
  }

  function renderMembers(UYELER) {
    window.LATEST_MEMBERS = UYELER;
    const memberChain = document.getElementById("member-chain");
    const memberDetail = document.getElementById("member-detail");

    if (memberChain && UYELER.length > 0) {
      let chainHtml = "";
      UYELER.forEach(function (uye, i) {
        const thumbSrc = uye.gorsel || `https://ui-avatars.com/api/?name=${encodeURIComponent(uye.isim)}&background=0a0a0a&color=fff&size=200`;

        // v10.4: 'Üye' yazısı (rol) kaldırıldı, soldaki isim paneli sadeleştirildi.
        chainHtml += `
            <div class="chain-item" data-index="${i}" role="button" tabindex="0">
                <div class="chain-rail">
                    <div class="chain-rail-line"></div>
                    <div class="chain-dot"></div>
                </div>
                <div class="chain-content">
                    <img class="chain-rank-img" src="${thumbSrc}" alt="${uye.isim}" style="border-radius: 50%; padding: 2px; border: 1px solid rgba(164,0,0,0.2)"/>
                    <div class="chain-rank-text">
                        <span class="chain-rank-name">${uye.isim}</span>
                    </div>
                    <i class='bx bx-chevron-right chain-arrow'></i>
                </div>
            </div>
        `;
      });
      memberChain.innerHTML = chainHtml;

      function showMemberDetail(index, uye) {
        if (!memberDetail || !uye) return;
        
        // Görselleri Hazırla
        const baseImages = Array.isArray(uye.gorseller) ? uye.gorseller : [uye.gorsel || `https://ui-avatars.com/api/?name=${encodeURIComponent(uye.isim)}&background=0a0a0a&color=fff&size=400`];
        
        // v10.4: Discord CDN/Media linklerini yakalayan güçlü Regex
        const discordImgRegex = /https:\/\/(?:cdn|media)\.discordapp\.(?:com|net)\/attachments\/[^\s\)\>\]\"\<]+/g;
        const bioContent = uye.bilgi || "";
        const extractedImages = bioContent.match(discordImgRegex) || [];
        const allImages = [...new Set([...baseImages, ...extractedImages])];

        // Biyografiyi temizle
        const cleanBio = bioContent
            .replace(discordImgRegex, '')
            .replace(/\s+/g, ' ') 
            .trim();

        let sliderHtml = "";
        if (allImages.length > 1) {
            sliderHtml = `
                <div class="slider-wrapper-v3">
                    <button class="slider-arrow prev" onclick="moveSmallSlider(event, -1)">&#10094;</button>
                    <div class="member-detail-slider scroll-slider" id="detail-slider">
                        <div class="slider-track" id="slider-track">
                            ${allImages.map(img => `
                                <div class="slider-item">
                                    <img src="${img}" alt="${uye.isim}" class="slider-img" onclick="openLightboxSimple('${img}')" onerror="this.src='images/placeholder.jpg'"/>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <button class="slider-arrow next" onclick="moveSmallSlider(event, 1)">&#10095;</button>
                </div>
            `;
        } else {
            const displayImg = allImages[0] || baseImages[0];
            sliderHtml = `
                <div class="member-img-frame">
                    <img class="detail-rank-img" src="${displayImg}" alt="${uye.isim}" onclick="openLightboxSimple('${displayImg}')" onerror="this.src='images/placeholder.jpg'"/>
                </div>
            `;
        }

        memberDetail.innerHTML = `
            <div class="detail-panel-inner">
                <div class="detail-content">
                    <div class="detail-header-v3">
                        <div class="detail-visual-area-v3">${sliderHtml}</div>
                        <div class="detail-info-content-v3">
                            <div class="detail-rank-info-v3">
                                <div class="info-v3-header">
                                    <i class='bx bx-id-card'></i> ÜYE DOSYASI
                                </div>
                                <p class="detail-rank-desc">
                                    ${(cleanBio || 'Biyografi bilgisi Discord üzerinden çekiliyor...')
                                      .replace(/([^>]+:)/g, '<span class="bio-key">$1</span>')}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
      }

      window.moveSmallSlider = (event, direction) => {
        event.stopPropagation();
        const slider = document.getElementById('detail-slider');
        if (!slider) return;
        // v10.4: Görsel boyutu 250px olduğu için kaydırma miktarı 250 olarak güncellendi.
        slider.scrollBy({ left: direction * 250, behavior: 'smooth' });
      };

      window.openLightboxSimple = (imgSrc) => {
        const lightbox = document.getElementById("lightbox");
        const lightboxImg = document.getElementById("lightbox-img");
        if (!lightbox || !lightboxImg) return;

        const activeItem = document.querySelector(".chain-item.active");
        if (!activeItem) return;

        const idx = parseInt(activeItem.dataset.index);
        const uye = window.LATEST_MEMBERS ? window.LATEST_MEMBERS[idx] : null;

        if (uye) {
            // v10.5 Ultra: Discord CDN/Media linklerini HTML etiketlerinden (<br> vb.) koruyarak ayıkla
            const discordImgRegex = /https:\/\/(?:cdn|media)\.discordapp\.(?:com|net)\/attachments\/[^\s\)\>\]\"\<]+/g;
            const extImgs = (uye.bilgi || "").match(discordImgRegex) || [];
            const baseImgs = Array.isArray(uye.gorseller) ? uye.gorseller : [uye.gorsel];
            window.currentLightboxImages = [...new Set([...baseImgs, ...extImgs])];
            
            window.currentLightboxIndex = window.currentLightboxImages.indexOf(imgSrc);
            if (window.currentLightboxIndex === -1) window.currentLightboxIndex = 0;

            lightboxImg.src = window.currentLightboxImages[window.currentLightboxIndex];
            
            const lbPrev = document.getElementById("lightbox-prev");
            const lbNext = document.getElementById("lightbox-next");
            const showArrows = window.currentLightboxImages.length > 1;
            if (lbPrev) lbPrev.style.display = showArrows ? "flex" : "none";
            if (lbNext) lbNext.style.display = showArrows ? "flex" : "none";

            lightbox.classList.add("active");
        }
      };

      memberChain.querySelectorAll(".chain-item").forEach(function (item) {
        item.addEventListener("click", function () {
          const idx = parseInt(item.dataset.index);
          memberChain.querySelectorAll(".chain-item").forEach(el => el.classList.remove("active"));
          item.classList.add("active");
          showMemberDetail(idx, UYELER[idx]);
        });
      });

      const firstItem = memberChain.querySelector(".chain-item");
      if (firstItem) {
        firstItem.classList.add("active");
        showMemberDetail(0, UYELER[0]);
      }
    }
  }

  fetchMembers();

  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxClose = document.getElementById("lightbox-close");
  const lightboxPrev = document.getElementById("lightbox-prev");
  const lightboxNext = document.getElementById("lightbox-next");

  if (lightbox && lightboxImg && lightboxClose) {
      window.moveLightbox = (direction) => {
          if (!window.currentLightboxImages || window.currentLightboxImages.length <= 1) return;
          window.currentLightboxIndex += direction;
          if (window.currentLightboxIndex < 0) window.currentLightboxIndex = window.currentLightboxImages.length - 1;
          if (window.currentLightboxIndex >= window.currentLightboxImages.length) window.currentLightboxIndex = 0;
          lightboxImg.src = window.currentLightboxImages[window.currentLightboxIndex];
      };

      if (lightboxPrev) lightboxPrev.addEventListener("click", (e) => { e.stopPropagation(); moveLightbox(-1); });
      if (lightboxNext) lightboxNext.addEventListener("click", (e) => { e.stopPropagation(); moveLightbox(1); });
      lightboxClose.addEventListener("click", () => lightbox.classList.remove("active"));
      lightbox.addEventListener("click", (e) => { if (e.target === lightbox) lightbox.classList.remove("active"); });
      
      document.addEventListener("keydown", (e) => { 
          if (!lightbox.classList.contains("active")) return;
          if (e.key === "Escape") lightbox.classList.remove("active"); 
          if (e.key === "ArrowLeft") moveLightbox(-1);
          if (e.key === "ArrowRight") moveLightbox(1);
      });
  }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initMembersPage);
} else {
    initMembersPage();
}
