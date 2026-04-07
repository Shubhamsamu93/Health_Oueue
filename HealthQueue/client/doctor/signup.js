// Doctor Signup Handler with Error Messages
document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value;
    const specialization = document.getElementById('specialization').value;
    const experience = document.getElementById('experience').value;
    const terms = document.getElementById('terms').checked;
    
    // Validation
    if (!name || !email || !phone || !password || !specialization || !experience) {
        alert('❌ Please fill all required fields');
        return;
    }
    
    if (password.length < 8) {
        alert('❌ Password must be at least 8 characters long');
        return;
    }
    
    if (!terms) {
        alert('❌ Please accept Terms & Conditions');
        return;
    }
    
    const signupBtn = document.querySelector('.btn-signup');
    const btnText = signupBtn.querySelector('.btn-text');
    const btnLoader = signupBtn.querySelector('.btn-loader');
    
    // Show loading state
    signupBtn.disabled = true;
    btnText.classList.add('d-none');
    btnLoader.classList.remove('d-none');
    
    try {
        const res = await fetch(`${window.API_BASE}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                email,
                phone,
                password,
                specialization,
                experience: parseInt(experience),
                role: 'doctor'
            })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            alert('✅ Doctor Account Created Successfully!\n\nRedirecting to login...');
            localStorage.setItem('signupEmail', email);
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        } else {
            alert('❌ Signup Failed: ' + (data.msg || data.error || 'Unknown error'));
            console.error('Signup error:', data);
        }
    } catch (error) {
        alert('❌ Connection Error: ' + error.message);
        console.error('Error:', error);
    } finally {
        // Reset button
        signupBtn.disabled = false;
        btnText.classList.remove('d-none');
        btnLoader.classList.add('d-none');
    }
});

// Password visibility toggle
function togglePassword() {
    const passwordInput = document.getElementById('password');
    const toggleBtn = document.querySelector('.toggle-password');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        passwordInput.type = 'password';
        toggleBtn.innerHTML = '<i class="fas fa-eye"></i>';
    }
}
